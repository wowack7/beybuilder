#!/usr/bin/env python3
"""iPhone 鏡像輸出 × /draw/ 👾 Agent 模式的自動抽獎迴圈（原型）。

重複的部分（點抽獎 → 點參加抽獎 → 打叉 → 等目錄換下一項）由這支跑，不經過 AI；
看不懂的畫面一律停下來、存截圖，交給人或 AI 接手。

用法（macOS，需 pyobjc-framework-Quartz、pyobjc-framework-Vision）：
  python3 draw_agent_loop.py probe              # 截圖＋文字辨識，印出判斷結果，不點任何東西
  python3 draw_agent_loop.py peek               # 只點一下「抽獎」，截官方頁；不按參加、不打叉（校準用）
  python3 draw_agent_loop.py run --max 3        # 實際處理 3 項
  python3 draw_agent_loop.py run --dry-run      # 走一輪判斷流程但不點

權限：執行這支的 App（例如「終端機」）要在 系統設定 > 隱私權與安全性 開
「螢幕錄製」（截圖）與「輔助使用」（點擊）。中止：Ctrl-C。

規則（使用者指定，見 SKILL.md）：
- 只在 👾 Agent 模式下跑：抽獎鈕位置固定、返回自動換下一項。
- 「參加抽獎」與「加入好友並參加抽獎」等同，直接按；確定按到就打叉，不等結果。
- 沒看到參加按鈕就不打叉（那時畫面可能還是目錄）。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import Quartz
import Vision

APP_NAMES = ('iPhone鏡像輸出', 'iPhone Mirroring', 'iPhone 鏡像輸出')

# 官方抽獎頁右上角叉叉的位置（視窗內比例）。2026-10-03 實測 414×918 視窗：(0.928, 0.132)，
# 舊技能紀錄 322×718 截圖上的 (298, 102) 也落在這附近。文字辨識讀得到「×」時以讀到的為準。
# 注意：目錄頁（LINE 內建瀏覽器）右上角的叉叉也在同一個位置——只有確定在官方頁才點
DEFAULT_CLOSE_AT = (0.928, 0.132)

PROGRESS_RE = re.compile(r'第\s*(\d+)\s*[／/]\s*(\d+)\s*項')
DRAW_BTN_RE = re.compile(r'^抽\s*[獎籤]$')  # 2026-10-03 前的頁面寫「抽籤」，LINE 會快取舊頁
JOIN_RE = re.compile(r'參加抽獎')
# 「解除封鎖並參加抽獎」＝使用者封鎖過這家的官方帳號。使用者 2026-10-03 決定：一律解除並參加，
# 跟「加入好友並參加抽獎」一樣直接按（--ask-unblock 可改回遇到就停）
UNBLOCK_RE = re.compile(r'解除封鎖')
LOST_RE = re.compile(r'未中獎|沒有抽中|銘謝惠顧')

SETTLE_S = 1.0       # 官方頁關掉、目錄重新出現後先等一下：LINE 的關閉動畫期間點擊會被吃掉（實測）
RETAP_AFTER_S = 2.5  # 點了抽獎這麼久畫面都沒變，就再點一次（點到的話按鈕會變灰，不會重複開）
MAX_TAPS = 3


@dataclass
class Window:
    wid: int
    x: float
    y: float
    w: float
    h: float


@dataclass
class Text:
    s: str
    conf: float
    cx: float  # 視窗內比例，左上為原點
    cy: float


@dataclass
class Screen:
    kind: str
    texts: list[Text] = field(default_factory=list)
    progress: tuple[int, int] | None = None
    target: Text | None = None
    shot: Path | None = None

    def summary(self) -> str:
        p = f' 第{self.progress[0]}/{self.progress[1]}項' if self.progress else ''
        t = f' → 「{self.target.s}」@({self.target.cx:.3f},{self.target.cy:.3f})' if self.target else ''
        return f'{self.kind}{p}{t}'


class Stop(Exception):
    """看不懂或不安全：停下來交給人／AI。"""


def find_window(retry_s: float = 3.0) -> Window:
    """鏡像視窗偶爾會短暫從清單消失（實測一次），等一下再判定找不到"""
    end = time.time() + retry_s
    while True:
        win = _find_window_once()
        if win or time.time() >= end:
            break
        time.sleep(0.3)
    if win is None:
        raise Stop('找不到「iPhone 鏡像輸出」視窗：確認鏡像已連線、視窗沒有縮到 Dock')
    return win


def _find_window_once() -> Window | None:
    opts = Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements
    best = None
    for w in Quartz.CGWindowListCopyWindowInfo(opts, Quartz.kCGNullWindowID):
        if w.get('kCGWindowOwnerName', '') not in APP_NAMES or w.get('kCGWindowLayer') != 0:
            continue
        b = w['kCGWindowBounds']
        if best is None or b['Width'] * b['Height'] > best.w * best.h:
            best = Window(int(w['kCGWindowNumber']), b['X'], b['Y'], b['Width'], b['Height'])
    return best


def capture(win: Window, path: Path) -> None:
    r = subprocess.run(['screencapture', '-x', '-o', '-l', str(win.wid), str(path)], capture_output=True, text=True)
    if r.returncode != 0 or not path.exists():
        raise Stop('截圖失敗：執行這支的 App 需要「螢幕錄製」權限（系統設定 > 隱私權與安全性 > 螢幕錄製）'
                   f'\n  {r.stderr.strip()}')


def ocr(path: Path) -> list[Text]:
    url = Quartz.CFURLCreateFromFileSystemRepresentation(None, str(path).encode(), len(str(path).encode()), False)
    src = Quartz.CGImageSourceCreateWithURL(url, None)
    img = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    req.setRecognitionLanguages_(['zh-Hant', 'en-US'])
    req.setUsesLanguageCorrection_(False)
    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(img, None)
    ok, err = handler.performRequests_error_([req], None)
    if not ok:
        raise Stop(f'文字辨識失敗：{err}')
    out = []
    for obs in req.results() or []:
        cand = obs.topCandidates_(1)
        if not cand:
            continue
        box = obs.boundingBox()  # 比例座標，左下為原點
        out.append(Text(
            s=str(cand[0].string()).strip(),
            conf=float(cand[0].confidence()),
            cx=box.origin.x + box.size.width / 2,
            cy=1 - (box.origin.y + box.size.height / 2),
        ))
    return out


def classify(texts: list[Text]) -> Screen:
    joined = '\n'.join(t.s for t in texts)
    m = PROGRESS_RE.search(joined.replace(' ', ''))
    progress = (int(m.group(1)), int(m.group(2))) if m else None

    if '走訪完畢' in joined or '沒有未抽的品項' in joined:
        return Screen('complete', texts, progress)
    if progress:
        if '沒偵測到' in joined:
            return Screen('catalog_error', texts, progress)
        if '開啟中' in joined or '等待返回' in joined:
            return Screen('catalog_busy', texts, progress)
        btn = next((t for t in texts if DRAW_BTN_RE.match(t.s.replace(' ', '')) and t.cy > 0.2), None)
        if btn:
            return Screen('catalog_ready', texts, progress, btn)
        return Screen('unknown', texts, progress)
    if '抽選目錄' in joined:
        # 一般清單（沒開 👾）：抽獎鈕位置會動，這支不處理
        return Screen('catalog_list', texts)
    if LOST_RE.search(joined):
        return Screen('official_lost', texts)
    join = next((t for t in texts if JOIN_RE.search(t.s)), None)
    if join and UNBLOCK_RE.search(join.s):
        return Screen('official_unblock', texts, target=join)
    if join:
        return Screen('official_join', texts, target=join)
    return Screen('unknown', texts)


class Runner:
    def __init__(self, shots: Path, dry: bool, close_at: tuple[float, float], verbose: bool,
                 allow_unblock: bool = True):
        self.allow_unblock = allow_unblock
        self.shots = shots
        self.dry = dry
        self.close_at = close_at
        self.verbose = verbose
        self.n = 0
        shots.mkdir(parents=True, exist_ok=True)

    def log(self, msg: str) -> None:
        print(time.strftime('%H:%M:%S'), msg, flush=True)

    def observe(self) -> Screen:
        win = find_window()
        self.n += 1
        path = self.shots / f'last-{self.n % 5}.png'
        capture(win, path)
        sc = classify(ocr(path))
        sc.shot = path
        if self.verbose:
            self.log(f'  看到 {sc.summary()}')
        return sc

    def click(self, fx: float, fy: float, what: str) -> None:
        win = find_window()
        x, y = win.x + fx * win.w, win.y + fy * win.h
        self.log(f'  點 {what} ({fx:.3f},{fy:.3f}) → 螢幕 ({x:.0f},{y:.0f}){"（乾跑，未點）" if self.dry else ""}')
        if self.dry:
            return
        pt = Quartz.CGPointMake(x, y)
        for typ in (Quartz.kCGEventMouseMoved, Quartz.kCGEventLeftMouseDown, Quartz.kCGEventLeftMouseUp):
            ev = Quartz.CGEventCreateMouseEvent(None, typ, pt, Quartz.kCGMouseButtonLeft)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
            time.sleep(0.05)

    def wait_for(self, kinds: set[str], timeout: float, every: float = 0.4) -> Screen:
        end = time.time() + timeout
        sc = self.observe()
        while sc.kind not in kinds and time.time() < end:
            time.sleep(every)
            sc = self.observe()
        return sc

    def stop(self, sc: Screen, why: str) -> None:
        keep = self.shots / f'stop-{time.strftime("%H%M%S")}.png'
        if sc.shot and sc.shot.exists():
            keep.write_bytes(sc.shot.read_bytes())
        raise Stop(f'{why}（畫面判斷：{sc.summary()}；截圖 {keep}）')

    def one_round(self) -> bool:
        """處理一項。回傳 False＝全部做完。"""
        official = {'official_join', 'official_lost', 'official_unblock'}
        sc = self.wait_for({'catalog_ready', 'complete', 'catalog_error', 'catalog_list'} | official, timeout=8)
        if sc.kind in official:
            # 從官方頁接手（上一輪中斷、或人先點開了）：直接處理這一頁
            self.log('目前停在官方頁，接著處理這一項')
            return self.finish_official(sc, None)
        if sc.kind == 'complete':
            return False
        if sc.kind == 'catalog_list':
            self.stop(sc, '目錄不在 👾 Agent 模式：先點右上角 👾 開啟')
        if sc.kind == 'catalog_error':
            self.stop(sc, '目錄顯示「沒偵測到抽獎頁打開或返回」：請人工判斷這一項')
        if sc.kind != 'catalog_ready':
            self.stop(sc, '等不到可以按的抽獎鈕')
        before = sc.progress
        self.log(f'第 {before[0]}/{before[1]} 項')
        time.sleep(SETTLE_S)
        for tap in range(MAX_TAPS):
            self.click(sc.target.cx, sc.target.cy, '抽獎' if tap == 0 else f'抽獎（第 {tap + 1} 次，前一下沒反應）')
            if self.dry:
                return False
            sc = self.wait_for(official | {'catalog_busy'}, timeout=RETAP_AFTER_S)
            if sc.kind != 'catalog_ready':
                break
        sc = self.wait_for(official, timeout=12)
        return self.finish_official(sc, before)

    def finish_official(self, sc: Screen, before: tuple[int, int] | None) -> bool:
        """在官方頁按參加、打叉、等目錄換下一項。before=None＝不知道開頁前是第幾項"""
        if sc.kind == 'official_unblock' and not self.allow_unblock:
            self.stop(sc, '按鈕是「解除封鎖並參加抽獎」：你封鎖過這家官方帳號，要不要解除請自己決定'
                          '（這一項請手動處理；之後一律解除就加 --allow-unblock）')
        if sc.kind == 'official_unblock':
            self.click(sc.target.cx, sc.target.cy, f'「{sc.target.s}」')
            time.sleep(0.5)
        elif sc.kind == 'official_lost':
            self.log('  先前已顯示未中獎，直接關閉')
        elif sc.kind == 'official_join':
            self.click(sc.target.cx, sc.target.cy, f'「{sc.target.s}」')
            time.sleep(0.5)
        else:
            # 參加鈕沒出現：要用 LINE 瀏覽器的原生重整，入口還沒驗證，這支先不碰
            self.stop(sc, '官方頁等不到「參加抽獎」按鈕（可能要重整同一頁）')

        sc_now = self.observe()
        x_mark = next((t for t in sc_now.texts if t.s in ('×', 'X', 'x', '✕') and t.cx > 0.85 and t.cy < 0.2), None)
        if x_mark:
            self.click(x_mark.cx, x_mark.cy, '官方頁叉叉（辨識到）')
        else:
            self.click(*self.close_at, '官方頁叉叉（預設位置）')
        sc = self.wait_for({'catalog_ready', 'complete', 'catalog_error'}, timeout=10)
        if sc.kind == 'complete':
            self.log('  已是最後一項')
            return False
        if sc.kind == 'catalog_ready' and before is None:
            return True
        if sc.kind == 'catalog_ready' and sc.progress and sc.progress[0] == before[0] + 1:
            return True
        if sc.kind == 'catalog_ready' and sc.progress == before:
            self.stop(sc, '回到目錄但沒有換下一項（叉叉可能沒點到，或目錄沒偵測到返回）')
        self.stop(sc, '關閉官方頁後畫面不如預期')
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['probe', 'peek', 'run'])
    ap.add_argument('--max', type=int, default=3, help='最多處理幾項（預設 3）')
    ap.add_argument('--dry-run', action='store_true', help='判斷流程照跑，但不點')
    ap.add_argument('--close-at', default=None, help='官方頁叉叉的視窗內比例，例如 0.925,0.142')
    ap.add_argument('--shots', default=str(Path.home() / 'Library/Caches/draw-agent-loop'), help='截圖存放處')
    ap.add_argument('--ask-unblock', action='store_true', help='遇到「解除封鎖並參加抽獎」就停下來，不自動按')
    ap.add_argument('-v', '--verbose', action='store_true')
    a = ap.parse_args()
    close_at = tuple(float(v) for v in a.close_at.split(',')) if a.close_at else DEFAULT_CLOSE_AT
    r = Runner(Path(a.shots), a.dry_run, close_at, a.verbose or a.cmd == 'probe', not a.ask_unblock)

    try:
        if a.cmd == 'probe':
            sc = r.observe()
            keep = Path(a.shots) / 'probe.png'
            keep.write_bytes(sc.shot.read_bytes())
            print(json.dumps([{'s': t.s, 'conf': round(t.conf, 2), 'x': round(t.cx, 3), 'y': round(t.cy, 3)}
                              for t in sc.texts], ensure_ascii=False, indent=1))
            print('判斷：', sc.summary(), '｜截圖：', keep)
            return 0
        subprocess.run(['osascript', '-e', 'tell application id "com.apple.ScreenContinuity" to activate'], check=False)
        time.sleep(0.6)
        if a.cmd == 'peek':
            sc = r.wait_for({'catalog_ready'}, timeout=5)
            if sc.kind != 'catalog_ready':
                r.stop(sc, '目錄上找不到可以按的抽獎鈕')
            r.click(sc.target.cx, sc.target.cy, '抽獎')
            sc = r.wait_for({'official_join', 'official_lost', 'official_unblock'}, timeout=12)
            keep = Path(a.shots) / 'peek.png'
            keep.write_bytes(sc.shot.read_bytes())
            for t in sc.texts:
                print(f'{t.cy:.3f} {t.cx:.3f} {t.conf:.2f} {t.s}')
            print('判斷：', sc.summary(), '｜截圖：', keep, '｜沒按參加、沒打叉，請自己處理這一項')
            return 0
        done = 0
        while done < a.max:
            if not r.one_round():
                break
            done += 1
        r.log(f'完成：本次處理 {done} 項')
        return 0
    except Stop as e:
        r.log(f'停止：{e}')
        return 2
    except KeyboardInterrupt:
        r.log('使用者中止')
        return 130


if __name__ == '__main__':
    sys.exit(main())
