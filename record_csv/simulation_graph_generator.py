import pandas as pd
import matplotlib.pyplot as plt

COLOR_PASSER = "#1f77b4"
COLOR_RECEIVER = "#d62728"
COLOR_TAU_PR = "#7c3aed"


def configure_matplotlib_fonts() -> None:
    plt.rcParams["font.size"] = 14
    plt.rcParams["axes.labelsize"] = 14
    plt.rcParams["xtick.labelsize"] = 14
    plt.rcParams["ytick.labelsize"] = 14
    plt.rcParams["legend.fontsize"] = 14
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = [
        "Hiragino Sans",
        "Yu Gothic",
        "Noto Sans CJK JP",
        "IPAexGothic",
        "TakaoGothic",
        "DejaVu Sans",
    ]
    plt.rcParams["axes.unicode_minus"] = False


configure_matplotlib_fonts()

# ============================================================
# CSV読み込み
# ============================================================

csv_path = "relay_simulation_lane4_20260820_163258.csv"
df = pd.read_csv(csv_path)

# e4a と e6 が実際に発生した試行のみをプロット
d = df.dropna(
    subset=[
        "e4a_t",
        "e6_t",
        "e6_X_P",
        "e6_X_R",
        "e6_v_P",
        "e6_v_R",
    ]
).copy()

# 「指定したはい！時刻」を操作変数として使用
x = d["scheduled_e4a_time"]

# 横軸の表示範囲
X_MIN = 7.4
X_MAX = 10.0


# ============================================================
# 1. 「はい！」指定時刻 vs バトン差し出し時刻
# ============================================================

fig1, ax1 = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)

ax1.scatter(
    x,
    d["e6_t"],
    s=20,
    color=COLOR_TAU_PR
)

ax1.set_xlabel(r'Scheduled time of "Go!" $t_{e4a}$ (s)')
ax1.set_ylabel(r'Baton-offer time $t_{e6}$ (s)')

ax1.set_xlim(X_MIN, X_MAX)
ax1.grid(True, alpha=0.25)

fig1.savefig("e4a_vs_e6_time.pdf", bbox_inches="tight")


# ============================================================
# 2. 「はい！」指定時刻 vs e6時点のP・R位置
# ============================================================

fig2, ax2 = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)

ax2.scatter(
    x,
    d["e6_X_P"],
    s=20,
    marker="o",
    color=COLOR_PASSER,
    label=r"$x_P$ at $e_6$"
)

ax2.scatter(
    x,
    d["e6_X_R"],
    s=20,
    marker="x",
    color=COLOR_RECEIVER,
    label=r"$x_R$ at $e_6$"
)

ax2.set_xlabel(r'Scheduled time of "Go!" $t_{e4a}$ (s)')
ax2.set_ylabel(r'Position at $e_6$ (m)')

ax2.set_xlim(X_MIN, X_MAX)
ax2.grid(True, alpha=0.25)

ax2.legend()

fig2.savefig("e4a_vs_e6_position.pdf", bbox_inches="tight")


# ============================================================
# 3. 「はい！」指定時刻 vs e6時点のP・R速度
# ============================================================

fig3, ax3 = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)

ax3.scatter(
    x,
    d["e6_v_P"],
    s=20,
    marker="o",
    color=COLOR_PASSER,
    label=r"$v_P$ at $e_6$"
)

ax3.scatter(
    x,
    d["e6_v_R"],
    s=20,
    marker="x",
    color=COLOR_RECEIVER,
    label=r"$v_R$ at $e_6$"
)

ax3.set_xlabel(r'Scheduled time of "Go!" $t_{e4a}$ (s)')
ax3.set_ylabel(r'Velocity at $e_6$ (m/s)')

ax3.set_xlim(X_MIN, X_MAX)
ax3.grid(True, alpha=0.25)

ax3.legend()

fig3.savefig("e4a_vs_e6_velocity.pdf", bbox_inches="tight")


# ============================================================
# 最後にまとめて表示
# ============================================================

plt.show()

print("Saved:")
print("  e4a_vs_e6_time.pdf")
print("  e4a_vs_e6_position.pdf")
print("  e4a_vs_e6_velocity.pdf")
