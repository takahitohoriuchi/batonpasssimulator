
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Table 3 from Ae, Ito, and Suzuki (1992), men's 100 m final
dist = np.array([10,20,30,40,50,60,70,80,90,100], dtype=float)

data = {
    "Lewis": {'f': [3.83, 4.81, 4.45, 4.41, 4.66, 4.86, 4.76, 4.45, 4.34, 4.53], 'L': [1.39, 1.92, 2.44, 2.55, 2.56, 2.42, 2.5, 2.71, 2.65, 2.57]},
    "Burrell": {'f': [3.59, 4.81, 4.61, 4.43, 4.41, 4.5, 4.57, 4.5, 4.34, 4.23], 'L': [1.52, 1.96, 2.38, 2.57, 2.61, 2.58, 2.52, 2.64, 2.59, 2.71]},
    "Mitchell": {'f': [4.28, 4.96, 4.61, 4.7, 4.92, 4.94, 4.74, 4.6, 4.67, 4.61], 'L': [1.3, 1.88, 2.33, 2.42, 2.34, 2.33, 2.46, 2.53, 2.43, 2.44]},
    "Christie": {'f': [3.89, 4.95, 4.65, 4.48, 4.54, 4.72, 4.84, 4.75, 4.44, 4.2], 'L': [1.39, 1.91, 2.34, 2.51, 2.59, 2.46, 2.4, 2.48, 2.5, 2.71]},
    "Fredericks": {'f': [4.31, 4.36, 4.61, 4.59, 4.91, 5.02, 4.96, 4.8, 4.66, 4.37], 'L': [1.25, 1.94, 2.36, 2.39, 2.34, 2.29, 2.35, 2.45, 2.41, 2.5]},
    "Stewart": {'f': [3.37, 5.02, 4.85, 4.79, 4.9, 4.97, 4.83, 4.55, 4.58, 4.73], 'L': [1.43, 1.86, 2.27, 2.35, 2.38, 2.31, 2.35, 2.52, 2.43, 2.35]},
    "da Silva": {'f': [3.96, 4.91, 4.49, 4.27, 4.36, 4.61, 4.73, 4.69, 4.36, 4.16], 'L': [1.32, 1.92, 2.4, 2.63, 2.6, 2.44, 2.35, 2.45, 2.55, 2.57]},
    "Surin": {'f': [3.98, 4.32, 4.52, 4.49, 4.67, 4.75, 4.54, 4.23, 4.21, 4.27], 'L': [1.34, 1.94, 2.41, 2.48, 2.41, 2.34, 2.5, 2.72, 2.61, 2.55]},
}

# Mean curves across the 8 finalists
f_mean = np.mean([v["f"] for v in data.values()], axis=0)   # stride frequency [Hz]
L_mean = np.mean([v["L"] for v in data.values()], axis=0)   # stride length [m]

# Normalize distance to x=d/100 to keep coefficients readable/stable
x = dist / 100.0

# 5th-degree least-squares polynomial fit
deg = 5
coef_f = np.polyfit(x, f_mean, deg)
coef_L = np.polyfit(x, L_mean, deg)

def f_rep(d):
    """
    Representative stride-frequency curve [Hz]
    d: distance [m]
    valid mainly over 10 <= d <= 100
    """
    x = np.asarray(d, dtype=float) / 100.0
    return np.polyval(coef_f, x)

def L_rep(d):
    """
    Representative stride-length curve [m]
    d: distance [m]
    valid mainly over 10 <= d <= 100
    """
    x = np.asarray(d, dtype=float) / 100.0
    return np.polyval(coef_L, x)

print("coef_f =", coef_f)
print("coef_L =", coef_L)

# Save mean data
mean_df = pd.DataFrame({
    "distance_m": dist,
    "f_mean_hz": f_mean,
    "L_mean_m": L_mean,
})
mean_df.to_csv("table3_mean_curves.csv", index=False)

# Plot
xx = np.linspace(10, 100, 400)

plt.figure(figsize=(8,5))
plt.scatter(dist, f_mean, label="Mean stride frequency data")
plt.plot(xx, f_rep(xx), label="Representative curve")
plt.xlabel("Distance (m)")
plt.ylabel("Stride frequency (Hz)")
plt.title("Representative stride-frequency curve")
plt.legend()
plt.tight_layout()
plt.savefig("representative_stride_frequency_curve.png", dpi=200)

plt.figure(figsize=(8,5))
plt.scatter(dist, L_mean, label="Mean stride length data")
plt.plot(xx, L_rep(xx), label="Representative curve")
plt.xlabel("Distance (m)")
plt.ylabel("Stride length (m)")
plt.title("Representative stride-length curve")
plt.legend()
plt.tight_layout()
plt.savefig("representative_stride_length_curve.png", dpi=200)

plt.show()
