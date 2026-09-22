import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.interpolate import CubicSpline

COLOR_INTRA = "#6b7280"
COLOR_INTRA_DARK = "#4b5563"


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
# Ae, Ito, and Suzuki (1992)
# Men's 100 m final
# ============================================================

dist = np.array(
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    dtype=float
)

data = {
    "Lewis": {
        "f": [3.83, 4.81, 4.45, 4.41, 4.66, 4.86, 4.76, 4.45, 4.34, 4.53],
        "L": [1.39, 1.92, 2.44, 2.55, 2.56, 2.42, 2.50, 2.71, 2.65, 2.57]
    },
    "Burrell": {
        "f": [3.59, 4.81, 4.61, 4.43, 4.41, 4.50, 4.57, 4.50, 4.34, 4.23],
        "L": [1.52, 1.96, 2.38, 2.57, 2.61, 2.58, 2.52, 2.64, 2.59, 2.71]
    },
    "Mitchell": {
        "f": [4.28, 4.96, 4.61, 4.70, 4.92, 4.94, 4.74, 4.60, 4.67, 4.61],
        "L": [1.30, 1.88, 2.33, 2.42, 2.34, 2.33, 2.46, 2.53, 2.43, 2.44]
    },
    "Christie": {
        "f": [3.89, 4.95, 4.65, 4.48, 4.54, 4.72, 4.84, 4.75, 4.44, 4.20],
        "L": [1.39, 1.91, 2.34, 2.51, 2.59, 2.46, 2.40, 2.48, 2.50, 2.71]
    },
    "Fredericks": {
        "f": [4.31, 4.36, 4.61, 4.59, 4.91, 5.02, 4.96, 4.80, 4.66, 4.37],
        "L": [1.25, 1.94, 2.36, 2.39, 2.34, 2.29, 2.35, 2.45, 2.41, 2.50]
    },
    "Stewart": {
        "f": [3.37, 5.02, 4.85, 4.79, 4.90, 4.97, 4.83, 4.55, 4.58, 4.73],
        "L": [1.43, 1.86, 2.27, 2.35, 2.38, 2.31, 2.35, 2.52, 2.43, 2.35]
    },
    "da Silva": {
        "f": [3.96, 4.91, 4.49, 4.27, 4.36, 4.61, 4.73, 4.69, 4.36, 4.16],
        "L": [1.32, 1.92, 2.40, 2.63, 2.60, 2.44, 2.35, 2.45, 2.55, 2.57]
    },
    "Surin": {
        "f": [3.98, 4.32, 4.52, 4.49, 4.67, 4.75, 4.54, 4.23, 4.21, 4.27],
        "L": [1.34, 1.94, 2.41, 2.48, 2.41, 2.34, 2.50, 2.72, 2.61, 2.55]
    }
}


# ============================================================
# 8選手の平均
# ============================================================

f_mean = np.mean(
    [v["f"] for v in data.values()],
    axis=0
)

L_mean = np.mean(
    [v["L"] for v in data.values()],
    axis=0
)


# ============================================================
# 10〜100 m：3次スプライン補間
# 10個の平均点をすべて通る
# ============================================================

f_spline = CubicSpline(dist, f_mean)
L_spline = CubicSpline(dist, L_mean)


# ============================================================
# 個人内成分
# ============================================================

def F_intra(d):
    """
    0 <= d < 10:
        10 m地点の値で一定

    10 <= d <= 100:
        3次スプライン補間

    d > 100:
        論文と同様に指数関数的に4.20へ収束
    """

    d = np.asarray(d, dtype=float)

    y = np.empty_like(d, dtype=float)

    mask_before = d < 10
    mask_middle = (d >= 10) & (d <= 100)
    mask_after = d > 100

    # 0〜10 m
    y[mask_before] = f_mean[0]

    # 10〜100 m
    y[mask_middle] = f_spline(d[mask_middle])

    # 100 m以降
    y[mask_after] = (
        4.20
        + 0.25 * np.exp(
            -0.233 * (d[mask_after] - 100)
        )
    )

    return y


def L_intra(d):
    """
    0 <= d < 10:
        10 m地点の値で一定

    10 <= d <= 100:
        3次スプライン補間

    d > 100:
        2.53 mで一定
    """

    d = np.asarray(d, dtype=float)

    y = np.empty_like(d, dtype=float)

    mask_before = d < 10
    mask_middle = (d >= 10) & (d <= 100)
    mask_after = d > 100

    # 0〜10 m
    y[mask_before] = L_mean[0]

    # 10〜100 m
    y[mask_middle] = L_spline(d[mask_middle])

    # 100 m以降
    y[mask_after] = 2.53

    return y


# ============================================================
# 確認
# ============================================================

print("Pitch mean points")
for x, y in zip(dist, f_mean):
    print(f"{x:3.0f} m : data={y:.5f}, spline={F_intra(np.array([x]))[0]:.5f}")

print()

print("Stride mean points")
for x, y in zip(dist, L_mean):
    print(f"{x:3.0f} m : data={y:.5f}, spline={L_intra(np.array([x]))[0]:.5f}")


# ============================================================
# CSV保存
# ============================================================

mean_df = pd.DataFrame({
    "distance_m": dist,
    "f_mean": f_mean,
    "L_mean_m": L_mean
})

mean_df.to_csv(
    "table3_mean_curves.csv",
    index=False
)


# ============================================================
# 描画用データ
# ============================================================

xx = np.linspace(0, 130, 1500)


# ============================================================
# ピッチ
# ============================================================

plt.figure(figsize=(8, 5))

plt.plot(
    xx,
    F_intra(xx),
    label=r"$F^{intra}(x)$",
    color=COLOR_INTRA,
    linewidth=2.0,
)

plt.scatter(
    dist,
    f_mean,
    label="10-m mean data",
    color=COLOR_INTRA,
)

plt.axvline(
    10,
    color=COLOR_INTRA_DARK,
    linestyle="--",
    linewidth=1
)

plt.axvline(
    100,
    color=COLOR_INTRA_DARK,
    linestyle="--",
    linewidth=1
)

plt.xlabel("Distance (m)")
plt.ylabel("Pitch (steps/s)")

plt.xlim(0, 130)
plt.ylim(bottom=0)
plt.tick_params(axis="both", labelsize=14)
plt.grid(True, alpha=0.25)

plt.legend()
plt.tight_layout()

plt.savefig(
    "pitch_intra.pdf",
    bbox_inches="tight"
)


# ============================================================
# 歩幅
# ============================================================

plt.figure(figsize=(8, 5))

plt.plot(
    xx,
    L_intra(xx),
    label=r"$L^{intra}(x)$",
    color=COLOR_INTRA,
    linewidth=2.0,
)

plt.scatter(
    dist,
    L_mean,
    label="10-m mean data",
    color=COLOR_INTRA,
)

plt.axvline(
    10,
    color=COLOR_INTRA_DARK,
    linestyle="--",
    linewidth=1
)

plt.axvline(
    100,
    color=COLOR_INTRA_DARK,
    linestyle="--",
    linewidth=1
)

plt.xlabel("Distance (m)")
plt.ylabel("Stride length (m)")

plt.xlim(0, 130)
plt.ylim(bottom=0)
plt.tick_params(axis="both", labelsize=14)
plt.grid(True, alpha=0.25)

plt.legend()
plt.tight_layout()

plt.savefig(
    "stride_intra.pdf",
    bbox_inches="tight"
)


plt.show()
