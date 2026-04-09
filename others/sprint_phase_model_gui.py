
import tkinter as tk
from tkinter import ttk
import numpy as np
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure


def sigmoid(x, width):
    width = max(width, 1e-6)
    return 1.0 / (1.0 + np.exp(-x / width))


def smooth_window(t, start, end, width):
    return sigmoid(t - start, width) - sigmoid(t - end, width)


def sprint_model(
    total_time=10.0,
    dt=0.01,
    vmax=12.1,
    tau_acc=1.65,
    t_decay=7.4,
    decay_rate=0.22,
    fmax=4.75,
    tau_f=0.70,
    t_f_decay=8.2,
    f_decay=0.25,
    l0=1.05,
    lmax=2.70,
    tau_l=2.00,
    t_l_plateau=5.5,
    t_l_decay=8.6,
    l_decay=0.12,
    blend_width=0.12,
):
    """
    A synthesized, phase-based sprint model.

    v(t): quasi-physical acceleration + slight late-race decay
    f(t): rapid rise -> plateau -> slight decay
    l(t): gradual rise -> plateau -> slight decay

    The model is meant for exploration, not for athlete-specific prediction.
    """
    t = np.arange(0, total_time + dt, dt)

    # Speed: exponential rise with late-race decay
    v_base = vmax * (1 - np.exp(-t / max(tau_acc, 1e-6)))
    decay_factor = np.exp(-decay_rate * np.clip(t - t_decay, 0, None))
    v = v_base * decay_factor

    # Pitch / step frequency: rises quickly, then plateaus, then gently declines
    f_rise = fmax * (1 - np.exp(-t / max(tau_f, 1e-6)))
    f_plateau = np.full_like(t, fmax)
    f_late = fmax * np.exp(-f_decay * np.clip(t - t_f_decay, 0, None))

    w1 = 1 - sigmoid(t - 1.8, blend_width)
    w2 = smooth_window(t, 1.8, t_f_decay, blend_width)
    w3 = sigmoid(t - t_f_decay, blend_width)
    f = w1 * f_rise + w2 * f_plateau + w3 * f_late

    # Stride length: slower rise than frequency, then plateau, then slight decline
    l_rise = l0 + (lmax - l0) * (1 - np.exp(-t / max(tau_l, 1e-6)))
    l_plateau = np.full_like(t, lmax)
    l_late = lmax - l_decay * np.clip(t - t_l_decay, 0, None)

    u1 = 1 - sigmoid(t - t_l_plateau, blend_width)
    u2 = smooth_window(t, t_l_plateau, t_l_decay, blend_width)
    u3 = sigmoid(t - t_l_decay, blend_width)
    l = u1 * l_rise + u2 * l_plateau + u3 * l_late
    l = np.maximum(l, 0.5)

    # Derived speed from kinematics
    v_from_fl = f * l

    # Distance integration
    x = np.cumsum(v) * dt

    return {
        "t": t,
        "v": v,
        "x": x,
        "f": f,
        "l": l,
        "v_from_fl": v_from_fl,
    }


class SprintGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("100m Sprint Phase Model Explorer")

        self.params = {
            "total_time": tk.DoubleVar(value=10.0),
            "vmax": tk.DoubleVar(value=12.1),
            "tau_acc": tk.DoubleVar(value=1.65),
            "t_decay": tk.DoubleVar(value=7.4),
            "decay_rate": tk.DoubleVar(value=0.22),
            "fmax": tk.DoubleVar(value=4.75),
            "tau_f": tk.DoubleVar(value=0.70),
            "t_f_decay": tk.DoubleVar(value=8.2),
            "f_decay": tk.DoubleVar(value=0.25),
            "l0": tk.DoubleVar(value=1.05),
            "lmax": tk.DoubleVar(value=2.70),
            "tau_l": tk.DoubleVar(value=2.00),
            "t_l_plateau": tk.DoubleVar(value=5.5),
            "t_l_decay": tk.DoubleVar(value=8.6),
            "l_decay": tk.DoubleVar(value=0.12),
            "blend_width": tk.DoubleVar(value=0.12),
        }

        main = ttk.Frame(root, padding=8)
        main.pack(fill="both", expand=True)

        controls = ttk.Frame(main)
        controls.pack(side="left", fill="y")

        plot_area = ttk.Frame(main)
        plot_area.pack(side="right", fill="both", expand=True)

        self.plot_mode = tk.StringVar(value="speed")

        ttk.Label(controls, text="Plot").pack(anchor="w", pady=(0, 4))
        for value, text in [
            ("speed", "Time - Speed"),
            ("distance", "Time - Distance"),
            ("pitch", "Time - Pitch"),
            ("stride", "Time - Stride"),
            ("all_kinematics", "Speed vs f*l"),
        ]:
            ttk.Radiobutton(
                controls, text=text, value=value, variable=self.plot_mode, command=self.update_plot
            ).pack(anchor="w")

        ttk.Separator(controls, orient="horizontal").pack(fill="x", pady=8)

        slider_specs = [
            ("total_time", 8.0, 14.0),
            ("vmax", 9.0, 13.5),
            ("tau_acc", 0.5, 3.0),
            ("t_decay", 5.0, 10.0),
            ("decay_rate", 0.0, 0.8),
            ("fmax", 3.5, 5.5),
            ("tau_f", 0.2, 2.0),
            ("t_f_decay", 5.0, 10.0),
            ("f_decay", 0.0, 0.8),
            ("l0", 0.5, 1.8),
            ("lmax", 1.8, 3.2),
            ("tau_l", 0.5, 4.0),
            ("t_l_plateau", 2.0, 8.0),
            ("t_l_decay", 5.0, 10.0),
            ("l_decay", 0.0, 0.4),
            ("blend_width", 0.02, 0.5),
        ]

        for name, lo, hi in slider_specs:
            frame = ttk.Frame(controls)
            frame.pack(fill="x", pady=2)
            ttk.Label(frame, text=name).pack(anchor="w")
            scale = tk.Scale(
                frame,
                variable=self.params[name],
                from_=lo,
                to=hi,
                resolution=(hi - lo) / 300.0,
                orient="horizontal",
                length=220,
                command=lambda _evt=None: self.update_plot(),
            )
            scale.pack(fill="x")

        btns = ttk.Frame(controls)
        btns.pack(fill="x", pady=6)
        ttk.Button(btns, text="Reset Defaults", command=self.reset_defaults).pack(side="left")
        ttk.Button(btns, text="Print Summary", command=self.print_summary).pack(side="left", padx=6)

        self.summary = tk.Text(controls, width=32, height=12)
        self.summary.pack(fill="both", expand=False, pady=(6, 0))

        self.fig = Figure(figsize=(8, 5), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=plot_area)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)

        self.defaults = {k: v.get() for k, v in self.params.items()}
        self.update_plot()

    def current_kwargs(self):
        return {k: v.get() for k, v in self.params.items()}

    def reset_defaults(self):
        for k, v in self.defaults.items():
            self.params[k].set(v)
        self.update_plot()

    def print_summary(self):
        data = sprint_model(**self.current_kwargs())
        t = data["t"]
        v = data["v"]
        x = data["x"]
        f = data["f"]
        l = data["l"]

        peak_idx = np.argmax(v)
        peak_speed = v[peak_idx]
        peak_time = t[peak_idx]
        peak_dist = x[peak_idx]

        finish_idx = np.argmax(x >= 100.0)
        finish_time = t[finish_idx] if x[-1] >= 100.0 else np.nan

        msg = (
            f"Peak speed: {peak_speed:.2f} m/s at {peak_time:.2f} s, about {peak_dist:.1f} m\\n"
            f"Predicted 100m time: {finish_time:.2f} s\\n"
            f"Peak pitch: {np.max(f):.2f} Hz\\n"
            f"Peak stride: {np.max(l):.2f} m\\n"
            f"Distance covered in total_time: {x[-1]:.1f} m\\n"
        )
        self.summary.delete("1.0", "end")
        self.summary.insert("1.0", msg)

    def update_plot(self):
        data = sprint_model(**self.current_kwargs())
        t = data["t"]
        v = data["v"]
        x = data["x"]
        f = data["f"]
        l = data["l"]
        v_from_fl = data["v_from_fl"]

        self.ax.clear()
        mode = self.plot_mode.get()

        if mode == "speed":
            self.ax.plot(t, v)
            self.ax.set_xlabel("Time (s)")
            self.ax.set_ylabel("Speed (m/s)")
            self.ax.set_title("Time - Speed")
        elif mode == "distance":
            self.ax.plot(t, x)
            self.ax.set_xlabel("Time (s)")
            self.ax.set_ylabel("Distance (m)")
            self.ax.set_title("Time - Distance")
        elif mode == "pitch":
            self.ax.plot(t, f)
            self.ax.set_xlabel("Time (s)")
            self.ax.set_ylabel("Pitch / Step frequency (Hz)")
            self.ax.set_title("Time - Pitch")
        elif mode == "stride":
            self.ax.plot(t, l)
            self.ax.set_xlabel("Time (s)")
            self.ax.set_ylabel("Stride length (m)")
            self.ax.set_title("Time - Stride")
        elif mode == "all_kinematics":
            self.ax.plot(t, v, label="Speed model")
            self.ax.plot(t, v_from_fl, label="f(t) * l(t)")
            self.ax.set_xlabel("Time (s)")
            self.ax.set_ylabel("Speed (m/s)")
            self.ax.set_title("Speed vs f(t) * l(t)")
            self.ax.legend()

        self.ax.grid(True, alpha=0.3)
        self.fig.tight_layout()
        self.canvas.draw_idle()
        self.print_summary()


def main():
    root = tk.Tk()
    app = SprintGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
