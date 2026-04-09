
import tkinter as tk
from tkinter import ttk
import numpy as np
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure


def sigmoid(x, k):
    k = max(k, 1e-6)
    return 1/(1+np.exp(-x/k))


def smooth_weights(t, centers, width):
    n = len(centers)
    if n == 1:
        return np.ones((1, len(t)))
    mids = [(centers[i] + centers[i+1]) / 2 for i in range(n-1)]
    ws = []
    for i in range(n):
        if i == 0:
            w = 1 - sigmoid(t - mids[0], width)
        elif i == n - 1:
            w = sigmoid(t - mids[-1], width)
        else:
            w = sigmoid(t - mids[i-1], width) - sigmoid(t - mids[i], width)
        ws.append(np.clip(w, 0, 1))
    ws = np.array(ws)
    ws /= (np.sum(ws, axis=0, keepdims=True) + 1e-12)
    return ws


def model(params):
    t = np.arange(0, params["T"] + params["dt"], params["dt"])

    # Pitch: 3 segments
    f_seg1 = params["f1"] * (1 - np.exp(-t / max(params["tau_f1"], 1e-6)))
    f_seg2 = np.ones_like(t) * params["f2"]
    f_seg3 = params["f2"] * np.exp(-np.clip(t - params["t_f3"], 0, None) / max(params["tau_f3"], 1e-6))
    wf = smooth_weights(t, [params["t_f1"], params["t_f2"], params["t_f3"]], params["blend"])
    f = wf[0] * f_seg1 + wf[1] * f_seg2 + wf[2] * f_seg3

    # Stride: 4 segments
    l_seg1 = params["l0"] + (params["l1"] - params["l0"]) * (1 - np.exp(-t / max(params["tau_l1"], 1e-6)))
    l_seg2 = params["l1"] + (params["l2"] - params["l1"]) * (1 - np.exp(-np.clip(t - params["t_l2"], 0, None) / max(params["tau_l2"], 1e-6)))
    l_seg3 = np.ones_like(t) * params["l3"]
    l_seg4 = params["l3"] - params["decay_l"] * np.clip(t - params["t_l4"], 0, None)
    l_seg4 = np.maximum(l_seg4, 0.5)
    wl = smooth_weights(t, [params["t_l1"], params["t_l2"], params["t_l3"], params["t_l4"]], params["blend"])
    l = wl[0] * l_seg1 + wl[1] * l_seg2 + wl[2] * l_seg3 + wl[3] * l_seg4

    v = f * l
    x = np.cumsum(v) * params["dt"]
    return t, x, v, f, l, wf, wl


PARAM_INFO = [
    ("T", "総時間", "シミュレーションする時間の長さ [s]", 8.0, 14.0, 0.1),
    ("dt", "時間刻み", "数値計算の刻み幅 [s]", 0.005, 0.05, 0.001),

    ("f1", "初期ピッチ上限", "立ち上がり区間で目指すピッチの大きさ [Hz]", 3.0, 6.0, 0.01),
    ("f2", "定常ピッチ", "中盤で維持するピッチ [Hz]", 3.0, 6.0, 0.01),
    ("tau_f1", "ピッチ立ち上がり時定数", "ピッチがどれくらい素早く上がるか [s]", 0.1, 2.0, 0.01),
    ("tau_f3", "ピッチ減衰時定数", "終盤でピッチがどれくらいゆっくり落ちるか [s]", 0.1, 3.0, 0.01),
    ("t_f1", "ピッチ区間1中心", "ピッチ第1区間（立ち上がり）の中心時刻 [s]", 0.2, 4.0, 0.01),
    ("t_f2", "ピッチ区間2中心", "ピッチ第2区間（定常）の中心時刻 [s]", 1.0, 7.0, 0.01),
    ("t_f3", "ピッチ区間3中心", "ピッチ第3区間（減衰）の中心時刻 [s]", 4.0, 11.0, 0.01),

    ("l0", "初期ストライド", "走り始めのストライド長 [m]", 0.5, 1.8, 0.01),
    ("l1", "前半ストライド", "初期加速後に近づくストライド長 [m]", 1.0, 2.4, 0.01),
    ("l2", "中盤ストライド", "中盤の伸長区間で近づくストライド長 [m]", 1.5, 3.0, 0.01),
    ("l3", "最大付近ストライド", "最大速度付近で維持するストライド長 [m]", 1.8, 3.2, 0.01),
    ("tau_l1", "ストライド立ち上がり時定数", "初期ストライドがどれくらい素早く伸びるか [s]", 0.1, 3.0, 0.01),
    ("tau_l2", "ストライド伸長時定数", "中盤ストライドがどれくらい素早く伸びるか [s]", 0.1, 4.0, 0.01),
    ("t_l1", "ストライド区間1中心", "ストライド第1区間の中心時刻 [s]", 0.2, 4.0, 0.01),
    ("t_l2", "ストライド区間2中心", "ストライド第2区間の中心時刻 [s]", 1.0, 6.0, 0.01),
    ("t_l3", "ストライド区間3中心", "ストライド第3区間の中心時刻 [s]", 2.0, 8.0, 0.01),
    ("t_l4", "ストライド区間4中心", "ストライド第4区間（減衰）の中心時刻 [s]", 4.0, 11.0, 0.01),
    ("decay_l", "終盤ストライド減少率", "終盤でストライドが落ちる速さ [m/s]", 0.0, 0.5, 0.005),

    ("blend", "平滑化幅", "区間の切り替わりをどれくらいなめらかにするか [s]", 0.02, 1.0, 0.01),
]


DEFAULTS = {
    "T": 10.0, "dt": 0.01,
    "f1": 4.5, "f2": 4.8, "tau_f1": 0.6, "tau_f3": 1.0,
    "t_f1": 1.5, "t_f2": 4.0, "t_f3": 7.5,
    "l0": 1.0, "l1": 1.8, "l2": 2.5, "l3": 2.7,
    "tau_l1": 1.5, "tau_l2": 2.0,
    "t_l1": 1.5, "t_l2": 3.0, "t_l3": 6.0, "t_l4": 8.0,
    "decay_l": 0.1,
    "blend": 0.2
}


class ScrollableControls(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        canvas = tk.Canvas(self, width=430)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)
        self.inner = ttk.Frame(canvas)

        self.inner.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=self.inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        canvas.bind_all("<MouseWheel>", _on_mousewheel)


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("100m走 ピッチ・ストライド区間モデル")
        self.vars = {k: tk.DoubleVar(value=v) for k, v in DEFAULTS.items()}

        main = ttk.Frame(root, padding=8)
        main.pack(fill="both", expand=True)

        left = ttk.Frame(main)
        left.pack(side="left", fill="y")

        right = ttk.Frame(main)
        right.pack(side="right", fill="both", expand=True)

        self.mode = tk.StringVar(value="tv")
        mode_frame = ttk.LabelFrame(left, text="表示モード")
        mode_frame.pack(fill="x", pady=(0, 8))

        modes = [
            ("時間-距離", "tx"),
            ("時間-速度", "tv"),
            ("時間-ピッチ", "tf"),
            ("時間-ストライド", "tl"),
            ("距離-ピッチ", "xf"),
            ("距離-ストライド", "xl"),
        ]
        for text, val in modes:
            ttk.Radiobutton(mode_frame, text=text, variable=self.mode, value=val, command=self.update).pack(anchor="w")

        info = ttk.LabelFrame(left, text="区間の考え方")
        info.pack(fill="x", pady=(0, 8))
        ttk.Label(
            info,
            text="ピッチ: 3区間（立ち上がり / 定常 / 減衰）\n"
                 "ストライド: 4区間（初期 / 伸長 / 維持 / 減衰）\n"
                 "切替は平滑化幅 blend でなめらかに混合",
            justify="left"
        ).pack(anchor="w", padx=6, pady=6)

        controls_wrap = ScrollableControls(left)
        controls_wrap.pack(fill="both", expand=True)
        controls = controls_wrap.inner

        for key, ja, desc, lo, hi, res in PARAM_INFO:
            box = ttk.LabelFrame(controls, text=f"{key} : {ja}")
            box.pack(fill="x", padx=2, pady=4)
            ttk.Label(box, text=desc, justify="left", wraplength=380).pack(anchor="w", padx=6, pady=(4, 2))
            row = ttk.Frame(box)
            row.pack(fill="x", padx=6, pady=(0, 6))
            scale = tk.Scale(
                row, from_=lo, to=hi, resolution=res, orient="horizontal",
                variable=self.vars[key], command=lambda _e=None: self.update(), length=300
            )
            scale.pack(side="left", fill="x", expand=True)
            ttk.Label(row, textvariable=self.vars[key], width=8).pack(side="left", padx=6)

        btn_row = ttk.Frame(controls)
        btn_row.pack(fill="x", pady=6)
        ttk.Button(btn_row, text="初期値に戻す", command=self.reset_defaults).pack(side="left")

        self.summary = tk.Text(left, width=52, height=9)
        self.summary.pack(fill="x", pady=(8, 0))

        self.fig = Figure(figsize=(8, 5), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=right)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)

        self.update()

    def get_params(self):
        return {k: v.get() for k, v in self.vars.items()}

    def reset_defaults(self):
        for k, v in DEFAULTS.items():
            self.vars[k].set(v)
        self.update()

    def update(self):
        t, x, v, f, l, wf, wl = model(self.get_params())
        self.ax.clear()
        m = self.mode.get()

        if m == "tx":
            self.ax.plot(t, x)
            self.ax.set_xlabel("時間 [s]")
            self.ax.set_ylabel("距離 [m]")
            self.ax.set_title("時間-距離")
        elif m == "tv":
            self.ax.plot(t, v)
            self.ax.set_xlabel("時間 [s]")
            self.ax.set_ylabel("速度 [m/s]")
            self.ax.set_title("時間-速度")
        elif m == "tf":
            self.ax.plot(t, f)
            self.ax.set_xlabel("時間 [s]")
            self.ax.set_ylabel("ピッチ [Hz]")
            self.ax.set_title("時間-ピッチ")
        elif m == "tl":
            self.ax.plot(t, l)
            self.ax.set_xlabel("時間 [s]")
            self.ax.set_ylabel("ストライド [m]")
            self.ax.set_title("時間-ストライド")
        elif m == "xf":
            self.ax.plot(x, f)
            self.ax.set_xlabel("距離 [m]")
            self.ax.set_ylabel("ピッチ [Hz]")
            self.ax.set_title("距離-ピッチ")
        elif m == "xl":
            self.ax.plot(x, l)
            self.ax.set_xlabel("距離 [m]")
            self.ax.set_ylabel("ストライド [m]")
            self.ax.set_title("距離-ストライド")

        self.ax.grid(True, alpha=0.3)
        self.fig.tight_layout()
        self.canvas.draw()

        finish_idx = np.argmax(x >= 100.0) if np.any(x >= 100.0) else len(x) - 1
        finish_time = t[finish_idx] if np.any(x >= 100.0) else float("nan")
        peak_idx = np.argmax(v)

        msg = (
            f"100m到達時間: {finish_time:.2f} s\n"
            f"最高速度: {v[peak_idx]:.2f} m/s （{t[peak_idx]:.2f} s, {x[peak_idx]:.1f} m）\n"
            f"最大ピッチ: {np.max(f):.2f} Hz\n"
            f"最大ストライド: {np.max(l):.2f} m\n"
            f"ピッチ区間中心: t_f1={self.vars['t_f1'].get():.2f}, t_f2={self.vars['t_f2'].get():.2f}, t_f3={self.vars['t_f3'].get():.2f}\n"
            f"ストライド区間中心: t_l1={self.vars['t_l1'].get():.2f}, t_l2={self.vars['t_l2'].get():.2f}, "
            f"t_l3={self.vars['t_l3'].get():.2f}, t_l4={self.vars['t_l4'].get():.2f}"
        )
        self.summary.delete("1.0", "end")
        self.summary.insert("1.0", msg)


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
