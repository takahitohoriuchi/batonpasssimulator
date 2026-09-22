from __future__ import annotations

import csv
import math
from pathlib import Path

import matplotlib.pyplot as plt
from scipy.interpolate import CubicSpline


ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "plots"
PROJECT_ROOT = ROOT.parent
COLOR_PASSER = "#1f77b4"
COLOR_RECEIVER = "#d62728"
COLOR_TAU_PR = "#7c3aed"
COLOR_TAU_RB = "#f59e0b"
COLOR_INTRA = "#6b7280"
COLOR_INTRA_DARK = "#4b5563"
COLOR_NO_INTERACTION = "#bcc7d8"
COLOR_EVENT = "#7a7a7a"
ZONE_END_BY_RECEIVER_START = {
    80.0: 110.0,
    180.0: 210.0,
    280.0: 310.0,
}
PAPER_PITCH_YLIM = (3.85, 4.85)
PAPER_STRIDE_YLIM = (1.32, 2.60)
REPRESENTATIVE_BREAKS = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
PITCH_SPLINE_COEFFICIENTS = [
    (0.0002265333361960, -0.0119710000858811, 0.1836816672392071, 3.9012500000000001),
    (0.0002265333361960, -0.0051750000000000, 0.0122216663803964, 4.7674999999999992),
    (-0.0000076666809802, 0.0016210000858811, -0.0233183327607924, 4.5987500000000008),
    (-0.0000558666122753, 0.0013909996564755, 0.0068016646627734, 4.5199999999999996),
    (-0.0000251168699187, -0.0002849987117829, 0.0178616741096989, 4.6712500000000006),
    (0.0000075840919501, -0.0010385048093438, 0.0046266388984313, 4.7962499999999997),
    (0.0000447805021184, -0.0008109820508417, -0.0138682297034238, 4.7462500000000007),
    (-0.0000079561004237, 0.0005324330127104, -0.0166537200847361, 4.5712499999999991),
    (-0.0000079561004237, 0.0002937500000000, -0.0083918899576318, 4.4500000000000002),
]
STRIDE_SPLINE_COEFFICIENTS = [
    (-0.0000596944778427, 0.0012970843352800, 0.0478736044314668, 1.3674999999999999),
    (-0.0000596944778427, -0.0004937500000000, 0.0559069477842666, 1.9162499999999998),
    (0.0000684723892133, -0.0022845843352800, 0.0281236044314668, 2.3662500000000000),
    (-0.0000154450790106, -0.0002304126588801, 0.0029736344898660, 2.4874999999999998),
    (0.0000495579268293, -0.0006937650291996, -0.0062681423909310, 2.4787500000000002),
    (0.0000059633716936, 0.0007929727756785, -0.0052760649261422, 2.3962499999999998),
    (-0.0000871614136036, 0.0009718739264857, 0.0123724020954998, 2.4287500000000000),
    (0.0000664322827207, -0.0016429684816214, 0.0056614565441429, 2.5624999999999996),
    (0.0000664322827207, 0.0003500000000000, -0.0072682282720714, 2.5212499999999998),
]


def main() -> None:
    configure_matplotlib_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    fill_tau_columns_in_csv(ROOT / "no_interaction.csv")

    matte = load_csv(ROOT / "matte.csv")
    interaction = load_csv(ROOT / "interaction.csv")
    no_interaction = load_csv(ROOT / "no_interaction.csv")
    tau_upper = compute_shared_tau_upper(matte, interaction)

    plot_tau_case(
        matte,
        out_path=OUT_DIR / "tau_case1_matte.png",
        y_limits=(0, tau_upper),
        annotate_wait=True,
    )
    plot_tau_case(
        interaction,
        out_path=OUT_DIR / "tau_case2_interaction.png",
        y_limits=(0, tau_upper),
    )
    plot_tau_case(
        no_interaction,
        out_path=OUT_DIR / "tau_case3_no_interaction.png",
        y_limits=(0, tau_upper),
        start_at_event="e2",
    )
    plot_pitch_comparison(
        interaction,
        no_interaction,
        out_path=OUT_DIR / "pitch_interaction_vs_no_interaction_zero.png",
        y_limits=(0, None),
    )
    plot_stride_comparison(
        interaction,
        no_interaction,
        out_path=OUT_DIR / "stride_interaction_vs_no_interaction_zero.png",
        y_limits=(0, None),
    )
    plot_pitch_comparison(
        interaction,
        no_interaction,
        out_path=OUT_DIR / "pitch_interaction_vs_no_interaction_paper_range.png",
        y_limits=(0, None),
    )
    plot_phase_case(
        interaction,
        out_path=OUT_DIR / "phase_case2_interaction.png",
    )
    plot_stride_comparison(
        interaction,
        no_interaction,
        out_path=OUT_DIR / "stride_interaction_vs_no_interaction_paper_range.png",
        y_limits=(0, None),
    )
    plot_position_case(
        matte,
        out_path=OUT_DIR / "position_case1_matte.png",
    )
    plot_position_case(
        interaction,
        out_path=OUT_DIR / "position_case2_interaction.png",
    )
    plot_position_case(
        no_interaction,
        out_path=OUT_DIR / "position_case3_no_interaction.png",
    )
    plot_velocity_case(
        matte,
        out_path=OUT_DIR / "velocity_case1_matte.png",
    )
    plot_velocity_case(
        interaction,
        out_path=OUT_DIR / "velocity_case2_interaction.png",
    )
    plot_velocity_case(
        no_interaction,
        out_path=OUT_DIR / "velocity_case3_no_interaction.png",
    )
    plot_paper_curve_zero_versions()

    print(f"saved plots to: {OUT_DIR}")


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


def load_csv(path: Path) -> dict[str, list[float]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        columns: dict[str, list[float]] = {}
        for row in reader:
            for key, raw_value in row.items():
                columns.setdefault(key, []).append(parse_float(raw_value))
    return columns


def parse_float(value: str | None) -> float:
    if value is None:
        return math.nan
    text = value.strip()
    if text == "":
        return math.nan
    try:
        return float(text)
    except ValueError:
        return math.nan


def fill_tau_columns_in_csv(path: Path) -> None:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames

    if not fieldnames or "tauPR" not in fieldnames or "tauRB" not in fieldnames:
        return

    zone_end = infer_zone_end(rows)
    if zone_end is None:
        return

    changed = False
    for row in rows:
        receiver_started = parse_float(row.get("e2")) >= 1.0
        x_p = parse_float(row.get("xP"))
        x_r = parse_float(row.get("xR"))
        v_p = parse_float(row.get("vP"))
        v_r = parse_float(row.get("vR"))

        if receiver_started:
            tau_pr = safe_time(x_r - x_p, v_p - v_r)
            tau_rb = safe_time(zone_end - x_r, v_r)
        else:
            tau_pr = math.nan
            tau_rb = math.nan

        tau_pr_text = format_csv_number(tau_pr)
        tau_rb_text = format_csv_number(tau_rb)

        if row.get("tauPR", "") != tau_pr_text:
            row["tauPR"] = tau_pr_text
            changed = True
        if row.get("tauRB", "") != tau_rb_text:
            row["tauRB"] = tau_rb_text
            changed = True

    if not changed:
        return

    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def infer_zone_end(rows: list[dict[str, str]]) -> float | None:
    first_running_receiver_x = None
    for row in rows:
        if parse_float(row.get("e2")) >= 1:
            first_running_receiver_x = parse_float(row.get("xR"))
            break
    if math.isnan(first_running_receiver_x or math.nan):
        return None

    nearest_start = min(
        ZONE_END_BY_RECEIVER_START.keys(),
        key=lambda start: abs(start - first_running_receiver_x),
    )
    return ZONE_END_BY_RECEIVER_START[nearest_start]


def safe_time(distance: float, speed: float) -> float:
    if math.isnan(distance) or math.isnan(speed):
        return math.nan
    if speed <= 1e-9:
        return math.inf
    return distance / speed


def format_csv_number(value: float) -> str:
    if math.isnan(value):
        return ""
    if math.isinf(value):
        return "Infinity"
    return f"{value:.15g}"


def first_event_time(data: dict[str, list[float]], event_key: str) -> float | None:
    for t, flag in zip(data["t"], data[event_key]):
        if not math.isnan(flag) and flag >= 1.0:
            return t
    return None


def first_event_index(data: dict[str, list[float]], event_key: str) -> int | None:
    for index, flag in enumerate(data[event_key]):
        if not math.isnan(flag) and flag >= 1.0:
            return index
    return None


def first_series_below_time(data: dict[str, list[float]], series_key: str, threshold: float) -> float | None:
    for t, value in zip(data["t"], data[series_key]):
        if math.isfinite(value) and value < threshold:
            return t
    return None


def first_catchup_time(data: dict[str, list[float]]) -> float | None:
    for t, x_p, x_r in zip(data["t"], data["xP"], data["xR"]):
        if math.isfinite(t) and math.isfinite(x_p) and math.isfinite(x_r) and x_p >= x_r:
            return t
    return None


def compute_shared_tau_upper(*datasets: dict[str, list[float]]) -> float:
    finite_values: list[float] = []
    for data in datasets:
        for series_name in ("tauPR", "tauRB"):
            for value in data[series_name]:
                if math.isfinite(value) and value >= 0:
                    finite_values.append(value)
    return padded_upper(max(finite_values)) if finite_values else 1.0


def plot_tau_case(
    data: dict[str, list[float]],
    *,
    out_path: Path,
    y_limits: tuple[float, float | None],
    annotate_wait: bool = False,
    start_at_event: str | None = None,
) -> None:
    t_values = list(data["t"])
    tau_pr_values = list(data["tauPR"])
    tau_rb_values = list(data["tauRB"])

    if start_at_event is not None:
        start_index = first_event_index(data, start_at_event)
        if start_index is not None:
            t_values = t_values[start_index:]
            tau_pr_values = tau_pr_values[start_index:]
            tau_rb_values = tau_rb_values[start_index:]

    fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
    ax.plot(t_values, tau_pr_values, label=r"$\tau_{PR}$ (predicted time for P to reach R)", linewidth=2.0, color=COLOR_TAU_PR)
    ax.plot(t_values, tau_rb_values, label=r"$\tau_{RB}$ (predicted time for R to reach the end of the baton zone)", linewidth=2.0, color=COLOR_TAU_RB)

    if annotate_wait:
        wait_t = first_event_time(data, "e4b")
        if wait_t is not None:
            ax.axvline(wait_t, color=COLOR_EVENT, linestyle="--", linewidth=1.8)

    stride_adjust_t = first_series_below_time(data, "L^inter", 1.0)
    add_event_line(ax, stride_adjust_t, color=COLOR_EVENT)

    ax.set_xlabel(r"$t$ [s]")
    ax.set_ylabel(r"$\tau$ [s]")
    ax.set_ylim(*y_limits)
    ax.grid(True, alpha=0.25)
    ax.legend(fontsize=10)
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def plot_pitch_comparison(
    interaction: dict[str, list[float]],
    no_interaction: dict[str, list[float]],
    *,
    out_path: Path,
    y_limits: tuple[float, float | None],
) -> None:
    interaction_pitch = add_series(interaction["F^intra"], interaction["F^inter"])
    interaction_receiver_pitch = build_interaction_receiver_pitch_series(interaction)
    no_interaction_pitch = build_no_interaction_intra_pitch_series(no_interaction)
    no_interaction_t_dense, no_interaction_pitch_dense = densify_series(no_interaction["t"], no_interaction_pitch)

    fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
    ax.plot(no_interaction_t_dense, no_interaction_pitch_dense, label=r"no interaction: $F_{P}^{\mathrm{intra}}$", linewidth=4.0, color=COLOR_NO_INTERACTION, zorder=2)
    ax.plot(interaction["t"], interaction_pitch, label=r"interaction: $F_{P}^{\mathrm{intra}} + F_{P}^{\mathrm{inter}}$", linewidth=2.0, color=COLOR_PASSER, linestyle="--", zorder=4)
    ax.plot(interaction["t"], interaction_receiver_pitch, label=r"interaction: $F_{R}$", linewidth=2.0, color=COLOR_RECEIVER, linestyle="--", zorder=3)
    ax.set_xlabel(r"$t$ [s]")
    ax.set_ylabel(r"$F$ [steps/s]")
    ax.set_ylim(*resolve_y_limits(interaction_pitch + interaction_receiver_pitch + no_interaction_pitch, y_limits))
    ax.grid(True, alpha=0.25)
    ax.legend()
    add_event_line(ax, first_event_time(interaction, "e2"), color=COLOR_EVENT)
    add_event_line(ax, first_event_time(no_interaction, "e2"), color=COLOR_EVENT)
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def plot_phase_case(
    data: dict[str, list[float]],
    *,
    out_path: Path,
) -> None:
    t_values = list(data["t"])
    phi_p_values = list(data["phiP"])
    phi_r_values = list(data["phiR"])

    fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
    ax.plot(t_values, phi_p_values, label=r"$\phi_{P}$", linewidth=2.0, color="#1f77b4")
    ax.plot(t_values, phi_r_values, label=r"$\phi_{R}$", linewidth=2.0, color="#d62728")
    ax.set_xlabel(r"$t$ [s]")
    ax.set_ylabel(r"$\phi$ [rad]")
    ax.set_xlim(left=0)
    ax.set_ylim(0, padded_upper(2 * math.pi))
    ax.set_yticks([0, 0.5 * math.pi, math.pi, 1.5 * math.pi, 2 * math.pi])
    ax.set_yticklabels(["0", r"$\frac{\pi}{2}$", r"$\pi$", r"$\frac{3\pi}{2}$", r"$2\pi$"])
    ax.grid(True, alpha=0.25)
    ax.legend()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def plot_stride_comparison(
    interaction: dict[str, list[float]],
    no_interaction: dict[str, list[float]],
    *,
    out_path: Path,
    y_limits: tuple[float, float | None],
) -> None:
    interaction_stride = mul_series(interaction["L^intra"], interaction["L^inter"])
    no_interaction_stride = build_no_interaction_intra_stride_series(no_interaction)
    no_interaction_t_dense, no_interaction_stride_dense = densify_series(no_interaction["t"], no_interaction_stride)

    fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
    ax.plot(no_interaction_t_dense, no_interaction_stride_dense, label=r"no interaction: $L_{P}^{\mathrm{intra}}$", linewidth=4.0, color=COLOR_NO_INTERACTION, zorder=2)
    ax.plot(interaction["t"], interaction_stride, label=r"interaction: $L_{P}^{\mathrm{intra}} \cdot L_{P}^{\mathrm{inter}}$", linewidth=2.0, color=COLOR_PASSER, linestyle="--", zorder=4)
    ax.set_xlabel(r"$t$ [s]")
    ax.set_ylabel(r"$L$ [m]")
    ax.set_ylim(*resolve_y_limits(interaction_stride + no_interaction_stride, y_limits))
    ax.grid(True, alpha=0.25)
    ax.legend()
    add_event_line(ax, first_event_time(interaction, "e2"), color=COLOR_EVENT)
    add_event_line(ax, first_event_time(no_interaction, "e2"), color=COLOR_EVENT)
    add_event_line(ax, first_series_below_time(interaction, "L^inter", 1.0), color=COLOR_EVENT)
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def plot_position_case(
    data: dict[str, list[float]],
    *,
    out_path: Path,
) -> None:
    x_values = list(data["t"])
    x_p_values = list(data["xP"])
    x_r_values = list(data["xR"])

    fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
    ax.plot(x_values, x_p_values, label=r"$X_{P}$", linewidth=2.0, color="#1f77b4")
    ax.plot(x_values, x_r_values, label=r"$X_{R}$", linewidth=2.0, color="#d62728")
    ax.set_xlabel(r"$t$ [s]")
    ax.set_ylabel(r"$X$ [m]")
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 110)
    add_event_line(ax, first_event_time(data, "e2"), color="#7a7a7a")
    add_event_line(ax, first_event_time(data, "e4b"), color="#7a7a7a")
    add_event_line(ax, first_catchup_time(data), color="#7a7a7a")
    ax.grid(True, alpha=0.25)
    ax.legend(loc="upper left")
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def plot_velocity_case(
    data: dict[str, list[float]],
    *,
    out_path: Path,
) -> None:
    t_values = list(data["t"])
    v_p_values = list(data["vP"])
    v_r_values = list(data["vR"])

    fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
    ax.plot(t_values, v_p_values, label=r"$v_{P}$", linewidth=2.0, color="#1f77b4")
    ax.plot(t_values, v_r_values, label=r"$v_{R}$", linewidth=2.0, color="#d62728")
    ax.set_xlabel(r"$t$ [s]")
    ax.set_ylabel(r"$v$ [m/s]")
    ax.set_xlim(left=0)
    ax.set_ylim(0, resolve_y_limits(v_p_values + v_r_values, (0, None))[1])
    ax.grid(True, alpha=0.25)
    ax.legend()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def add_event_line(ax, x_value: float | None, *, color: str) -> None:
    if x_value is None:
        return
    ax.axvline(x_value, color=color, linestyle="--", linewidth=1.6, alpha=0.9)


def build_no_interaction_intra_pitch_series(data: dict[str, list[float]]) -> list[float]:
    return [representative_pitch_intra(distance) for distance in derive_run_distances(data["xP"])]


def build_interaction_receiver_pitch_series(data: dict[str, list[float]]) -> list[float]:
    receiver_start_distance = infer_receiver_start_distance(data)
    out: list[float] = []

    for x_r, v_r, e2, e5 in zip(data["xR"], data["vR"], data["e2"], data["e5"]):
        if not math.isfinite(x_r) or not math.isfinite(v_r) or not math.isfinite(e2) or e2 < 1.0:
            out.append(math.nan)
            continue

        run_distance = max(0.0, x_r - receiver_start_distance)
        stride = representative_stride_intra(run_distance)
        if math.isfinite(e5) and e5 >= 1.0:
            stride *= 0.9

        if not math.isfinite(stride) or stride <= 1e-9:
            out.append(math.nan)
            continue

        out.append(v_r / stride)

    return out


def build_no_interaction_intra_stride_series(data: dict[str, list[float]]) -> list[float]:
    return [representative_stride_intra(distance) for distance in derive_run_distances(data["xP"])]


def derive_run_distances(x_positions: list[float]) -> list[float]:
    finite_positions = [value for value in x_positions if math.isfinite(value)]
    if not finite_positions:
        return [math.nan] * len(x_positions)
    start_position = finite_positions[0]
    return [value - start_position if math.isfinite(value) else math.nan for value in x_positions]


def infer_receiver_start_distance(data: dict[str, list[float]]) -> float:
    start_index = first_event_index(data, "e2")
    if start_index is None:
        return 0.0

    first_running_x = data["xR"][start_index]
    if not math.isfinite(first_running_x):
        return 0.0

    return min(ZONE_END_BY_RECEIVER_START.keys(), key=lambda start: abs(start - first_running_x))


def representative_pitch_intra(run_distance: float) -> float:
    distance = normalize_run_distance(run_distance)
    spline_value = evaluate_representative_piecewise_cubic(distance, PITCH_SPLINE_COEFFICIENTS)
    if spline_value is not None:
        return spline_value
    return 4.2 + 0.25 * math.exp(-0.233 * (distance - 100.0))


def representative_stride_intra(run_distance: float) -> float:
    distance = normalize_run_distance(run_distance)
    spline_value = evaluate_representative_piecewise_cubic(distance, STRIDE_SPLINE_COEFFICIENTS)
    if spline_value is not None:
        return spline_value
    return 2.53


def normalize_run_distance(run_distance: float) -> float:
    if not math.isfinite(run_distance):
        return math.nan
    return max(10.0, run_distance)


def evaluate_representative_piecewise_cubic(distance: float, coefficients: list[tuple[float, float, float, float]]) -> float | None:
    if not math.isfinite(distance):
        return math.nan
    for index, (a, b, c, intercept) in enumerate(coefficients):
        end = REPRESENTATIVE_BREAKS[index + 1]
        if distance <= end:
            start = REPRESENTATIVE_BREAKS[index]
            u = distance - start
            return ((a * u + b) * u + c) * u + intercept
    return None


def densify_series(times: list[float], values: list[float], *, factor: int = 8) -> tuple[list[float], list[float]]:
    samples = [(t, v) for t, v in zip(times, values) if math.isfinite(t) and math.isfinite(v)]
    if len(samples) < 2:
        return list(times), list(values)

    sample_times = [t for t, _ in samples]
    sample_values = [v for _, v in samples]
    dense_count = max(len(sample_times) * factor, len(sample_times))
    spline = CubicSpline(sample_times, sample_values)
    dense_times = [
        sample_times[0] + (sample_times[-1] - sample_times[0]) * index / (dense_count - 1)
        for index in range(dense_count)
    ]
    dense_values = [float(spline(t)) for t in dense_times]
    return dense_times, dense_values


def resolve_y_limits(values: list[float], requested: tuple[float, float | None]) -> tuple[float, float]:
    bottom, top = requested
    if top is not None:
        return bottom, top
    finite_values = [value for value in values if math.isfinite(value)]
    if not finite_values:
        return bottom, bottom + 1.0
    return bottom, padded_upper(max(finite_values))


def padded_upper(max_value: float) -> float:
    if not math.isfinite(max_value):
        return 1.0
    if max_value <= 0:
        return 1.0
    padding = max(0.03 * max_value, 0.05)
    return max_value + padding


def plot_paper_curve_zero_versions() -> None:
    mean_curve_rows = load_named_rows(PROJECT_ROOT / "table3_mean_curves.csv")
    extended_rows = load_named_rows(PROJECT_ROOT / "extended_stride_velocity_table.csv")

    mean_dist = [row["distance_m"] for row in mean_curve_rows]
    mean_pitch = [get_first_finite(row, "f_mean_hz", "f_mean") for row in mean_curve_rows]
    mean_stride = [row["L_mean_m"] for row in mean_curve_rows]
    dense_dist = [row["distance_m"] for row in extended_rows]
    dense_pitch = [row["stride_frequency_hz"] for row in extended_rows]
    dense_stride = [row["stride_length_m"] for row in extended_rows]

    plot_paper_curve(
        dense_dist,
        dense_pitch,
        mean_dist,
        mean_pitch,
        out_path=OUT_DIR / "paper_pitch_zero_based.png",
        ylabel="ピッチ (歩/s)",
        y_limits=(0, None),
    )
    plot_paper_curve(
        dense_dist,
        dense_stride,
        mean_dist,
        mean_stride,
        out_path=OUT_DIR / "paper_stride_zero_based.png",
        ylabel="歩幅 (m)",
        y_limits=(0, None),
    )


def load_named_rows(path: Path) -> list[dict[str, float]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows: list[dict[str, float]] = []
        for row in reader:
            rows.append({key: parse_float(value) for key, value in row.items()})
    return rows


def get_first_finite(row: dict[str, float], *keys: str) -> float:
    for key in keys:
        value = row.get(key, math.nan)
        if math.isfinite(value):
            return value
    return math.nan


def plot_paper_curve(
    dense_x: list[float],
    dense_y: list[float],
    point_x: list[float],
    point_y: list[float],
    *,
    out_path: Path,
    ylabel: str,
    y_limits: tuple[float, float | None],
) -> None:
    fig, ax = plt.subplots(figsize=(8.2, 4.6), constrained_layout=True)
    ax.plot(dense_x, dense_y, linewidth=2.0, color="#1f77b4")
    ax.scatter(point_x, point_y, s=24, color="#1f77b4", zorder=3)
    ax.axvline(100, color="#888888", linestyle="--", linewidth=1.4)
    ax.set_xlabel("走破距離 (m)")
    ax.set_ylabel(ylabel)
    ax.set_ylim(*resolve_y_limits(dense_y + point_y, y_limits))
    ax.grid(True, alpha=0.25)
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def add_series(a: list[float], b: list[float]) -> list[float]:
    out: list[float] = []
    for av, bv in zip(a, b):
        if math.isnan(av) and math.isnan(bv):
            out.append(math.nan)
        elif math.isnan(av):
            out.append(bv)
        elif math.isnan(bv):
            out.append(av)
        else:
            out.append(av + bv)
    return out


def mul_series(a: list[float], b: list[float]) -> list[float]:
    out: list[float] = []
    for av, bv in zip(a, b):
        if math.isnan(av) or math.isnan(bv):
            out.append(math.nan)
        else:
            out.append(av * bv)
    return out


if __name__ == "__main__":
    main()
