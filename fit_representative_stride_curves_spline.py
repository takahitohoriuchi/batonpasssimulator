import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.interpolate import CubicSpline

distances = np.array([10,20,30,40,50,60,70,80,90,100], dtype=float)

data = {
    ("Lewis","USA"): {
        "stride_frequency":[3.83,4.81,4.45,4.41,4.66,4.86,4.76,4.45,4.34,4.53],
        "stride_length":[1.39,1.92,2.44,2.55,2.56,2.42,2.50,2.71,2.65,2.57],
    },
    ("Burrell","USA"): {
        "stride_frequency":[3.59,4.81,4.61,4.43,4.41,4.50,4.57,4.50,4.34,4.23],
        "stride_length":[1.52,1.96,2.38,2.57,2.61,2.58,2.52,2.64,2.59,2.71],
    },
    ("Mitchell","USA"): {
        "stride_frequency":[4.28,4.96,4.61,4.70,4.92,4.94,4.74,4.60,4.67,4.61],
        "stride_length":[1.30,1.88,2.33,2.42,2.34,2.33,2.46,2.53,2.43,2.44],
    },
    ("Christie","GBR"): {
        "stride_frequency":[3.89,4.95,4.65,4.48,4.54,4.72,4.84,4.75,4.44,4.20],
        "stride_length":[1.39,1.91,2.34,2.51,2.59,2.46,2.40,2.48,2.50,2.71],
    },
    ("Fredericks","NAM"): {
        "stride_frequency":[4.31,4.36,4.61,4.59,4.91,5.02,4.96,4.80,4.66,4.37],
        "stride_length":[1.25,1.94,2.36,2.39,2.34,2.29,2.35,2.45,2.41,2.50],
    },
    ("Stewart","JAM"): {
        "stride_frequency":[3.37,5.02,4.85,4.79,4.90,4.97,4.83,4.55,4.58,4.73],
        "stride_length":[1.43,1.86,2.27,2.35,2.38,2.31,2.35,2.52,2.43,2.35],
    },
    ("da Silva","BRA"): {
        "stride_frequency":[3.96,4.91,4.49,4.27,4.36,4.61,4.73,4.69,4.36,4.16],
        "stride_length":[1.32,1.92,2.40,2.63,2.60,2.44,2.35,2.45,2.55,2.57],
    },
    ("Surin","CAN"): {
        "stride_frequency":[3.98,4.32,4.52,4.49,4.67,4.75,4.54,4.23,4.21,4.27],
        "stride_length":[1.34,1.94,2.41,2.48,2.41,2.34,2.50,2.72,2.61,2.55],
    },
}

# Long format
rows = []
for (name, country), vals in data.items():
    for param, arr in vals.items():
        for d, v in zip(distances, arr):
            rows.append({
                "name": name,
                "country": country,
                "parameter": param,
                "distance_m": d,
                "value": v
            })
df = pd.DataFrame(rows)

# Mean curves
mean_f = (
    df[df["parameter"] == "stride_frequency"]
    .groupby("distance_m")["value"]
    .mean()
    .reindex(distances)
    .values
)

mean_L = (
    df[df["parameter"] == "stride_length"]
    .groupby("distance_m")["value"]
    .mean()
    .reindex(distances)
    .values
)

# Natural cubic spline (10m〜100m)
cs_f = CubicSpline(distances, mean_f, bc_type="natural")
cs_L = CubicSpline(distances, mean_L, bc_type="natural")

# ----------------------------
# 100m以降の拡張パラメータ
# ----------------------------

# pitch / stride frequency は指数収束
f_inf = 4.20
f_100 = float(cs_f(100.0))
f_prime_100 = float(cs_f.derivative()(100.0))
k_f = -f_prime_100 / (f_100 - f_inf)

# stride length は100m以降一定
L_100 = float(cs_L(100.0))

print("f(100) =", f_100)
print("L(100) =", L_100)
print("f'(100) =", f_prime_100)
print("k_f =", k_f)

# ----------------------------
# 拡張関数
# ----------------------------
def f_extended(d):
    d = np.asarray(d, dtype=float)
    y = np.empty_like(d)

    mask_in = d <= 100
    mask_out = d > 100

    y[mask_in] = cs_f(d[mask_in])
    y[mask_out] = f_inf + (f_100 - f_inf) * np.exp(-k_f * (d[mask_out] - 100.0))

    return y

def L_extended(d):
    d = np.asarray(d, dtype=float)
    y = np.empty_like(d)

    mask_in = d <= 100
    mask_out = d > 100

    y[mask_in] = cs_L(d[mask_in])
    y[mask_out] = L_100   # 100m以降は一定

    return y

def v_extended(d):
    return f_extended(d) * L_extended(d)

# スカラー入力にも対応したい場合
def f_extended_scalar(d):
    if d <= 100:
        return float(cs_f(d))
    else:
        return float(f_inf + (f_100 - f_inf) * np.exp(-k_f * (d - 100.0)))

def L_extended_scalar(d):
    if d <= 100:
        return float(cs_L(d))
    else:
        return float(L_100)

def v_extended_scalar(d):
    return f_extended_scalar(d) * L_extended_scalar(d)

# Evaluation example (10〜130m)
d_dense = np.linspace(10, 130, 800)
f_dense = f_extended(d_dense)
L_dense = L_extended(d_dense)
v_dense = v_extended(d_dense)

# 10m刻みの表も作る
d_step = np.arange(10, 131, 10)
out_table = pd.DataFrame({
    "distance_m": d_step,
    "stride_frequency_hz": f_extended(d_step),
    "stride_length_m": L_extended(d_step),
    "velocity_m_per_s": v_extended(d_step),
})
print("\n10m step table:")
print(out_table.round(4))
out_table.to_csv("extended_stride_velocity_table.csv", index=False)

# Plot: stride frequency
plt.figure(figsize=(8,5))
plt.scatter(distances, mean_f, label="Mean points")
plt.plot(d_dense, f_dense, label="Extended curve f(d)")
plt.axvline(100, linestyle="--", alpha=0.5, label="100m")
plt.xlabel("Distance (m)")
plt.ylabel("Stride frequency (Hz)")
plt.legend()
plt.tight_layout()
plt.savefig("spline_stride_frequency_curve_extended.png", dpi=200)
plt.close()

# Plot: stride length
plt.figure(figsize=(8,5))
plt.scatter(distances, mean_L, label="Mean points")
plt.plot(d_dense, L_dense, label="Extended curve L(d)")
plt.axvline(100, linestyle="--", alpha=0.5, label="100m")
plt.xlabel("Distance (m)")
plt.ylabel("Stride length (m)")
plt.legend()
plt.tight_layout()
plt.savefig("spline_stride_length_curve_extended_constant_after_100m.png", dpi=200)
plt.close()

# Plot: velocity
plt.figure(figsize=(8,5))
plt.plot(d_dense, v_dense, label="v(d) = f(d) * L(d)")
plt.axvline(100, linestyle="--", alpha=0.5, label="100m")
plt.xlabel("Distance (m)")
plt.ylabel("Velocity (m/s)")
plt.legend()
plt.tight_layout()
plt.savefig("spline_velocity_curve_extended.png", dpi=200)
plt.close()

# Plot: combined
plt.figure(figsize=(8,5))
plt.plot(d_dense, f_dense, label="f(d)")
plt.plot(d_dense, L_dense, label="L(d)")
plt.plot(d_dense, v_dense, label="v(d)")
plt.axvline(100, linestyle="--", alpha=0.5, label="100m")
plt.xlabel("Distance (m)")
plt.ylabel("Value")
plt.legend()
plt.tight_layout()
plt.savefig("spline_combined_extended_with_velocity.png", dpi=200)
plt.close()

# Piecewise coefficients of spline part only (10〜100m)
# On interval [x_i, x_{i+1}], scipy uses:
# S_i(d) = c[0,i]*(d-x_i)^3 + c[1,i]*(d-x_i)^2 + c[2,i]*(d-x_i) + c[3,i]
print("\nStride frequency spline coefficients (10-100m):")
print(cs_f.c)

print("\nStride length spline coefficients (10-100m):")
print(cs_L.c)

print("\nExponential extension for f(d) (d > 100):")
print(f"f(d) = {f_inf:.10f} + ({f_100:.10f} - {f_inf:.10f}) * exp(-{k_f:.10f} * (d - 100))")

print("\nConstant extension for L(d) (d > 100):")
print(f"L(d) = {L_100:.10f}")