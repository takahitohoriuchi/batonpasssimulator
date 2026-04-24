export class TrackGeometry {
	constructor() {
		this.R_kerb = 36.5
		this.L = 84.39
		this.laneW = 1.22
		this.lanes = 8

		this.finishS = 0

		// 2-4走ゾーン（仮）：100/200/300mスクラッチで、開始= -20, 終了= +10（30m）
		this.zoneScratches = [300, 200, 100]
		this.zoneStartOffset = 20
		this.zoneEndOffset = 10

		this.distMarks = [100, 200, 300]
	}

	laneCenterRadius(lane) {
		return this.R_kerb + (lane - 0.5) * this.laneW
	}
	laneInnerRadius(lane) {
		return this.R_kerb + (lane - 1) * this.laneW
	}
	laneOuterRadius(lane) {
		return this.R_kerb + lane * this.laneW
	}

	lapLengthForRadius(R) {
		return 2 * this.L + 2 * Math.PI * R
	}
	lapLengthLaneCenter(lane) {
		return this.lapLengthForRadius(this.laneCenterRadius(lane))
	}

	// s=0 は右下（ホームストレート右端）=(+L/2, +R)
	// 注意：この幾何の s増加は「下直線 右→左」。左回りで走らせたいので、runnerは s を減らして進める。
	sToXY_radius(R, s) {
		const L = this.L
		const C1 = { x: -L / 2, y: 0 }
		const C2 = { x: L / 2, y: 0 }

		const segA = L
		const segB = Math.PI * R
		const segC = L
		const segD = Math.PI * R
		const P = segA + segB + segC + segD

		let u = ((s % P) + P) % P

		// 下直線：(+L/2,+R) -> (-L/2,+R)
		if (u < segA) {
			const t = u / segA
			return { x: +L / 2 - t * L, y: +R }
		}
		u -= segA

		// 左半円：+90 -> +270
		if (u < segB) {
			const t = u / segB
			const ang = Math.PI / 2 + t * Math.PI
			return { x: C1.x + R * Math.cos(ang), y: C1.y + R * Math.sin(ang) }
		}
		u -= segB

		// 上直線：(-L/2,-R) -> (+L/2,-R)
		if (u < segC) {
			const t = u / segC
			return { x: -L / 2 + t * L, y: -R }
		}
		u -= segC

		// 右半円：-90 -> +90
		{
			const t = u / segD
			const ang = -Math.PI / 2 + t * Math.PI
			return { x: C2.x + R * Math.cos(ang), y: C2.y + R * Math.sin(ang) }
		}
	}

	sToXY(lane, s) {
		return this.sToXY_radius(this.laneCenterRadius(lane), s)
	}
}

// --- 視点＆描画ユーティリティ ---
export class TrackView {
	constructor() {
		this.track = new TrackGeometry()

		this.pxPerM = 6
		this.zoom = 1.0
		this.panX = 0
		this.panY = 0
		this.zoomMin = 0.2
		this.zoomMax = 8.0
		this.zoomStep = 1.08

		this.isPanning = false
		this.panStartMouseX = 0
		this.panStartMouseY = 0
		this.panStartX = 0
		this.panStartY = 0

		// 見た目
		this.trackStroke = 200
		this.trackLineW_m = 0.18
		this.markLineW_m = 0.18
	}

	beginDraw() {
		push()
		translate(width / 2 + this.panX, height / 2 + this.panY)
		scale(this.zoom * this.pxPerM, this.zoom * this.pxPerM)
	}
	endDraw() {
		pop()
	}

	screenToWorld(sx, sy) {
		const x = (sx - (width / 2 + this.panX)) / (this.zoom * this.pxPerM)
		const y = (sy - (height / 2 + this.panY)) / (this.zoom * this.pxPerM)
		return { x, y }
	}

	zoomAtMouse(factor) {
		const before = this.screenToWorld(mouseX, mouseY)
		this.zoom = constrain(this.zoom * factor, this.zoomMin, this.zoomMax)
		this.panX = mouseX - width / 2 - before.x * this.zoom * this.pxPerM
		this.panY = mouseY - height / 2 - before.y * this.zoom * this.pxPerM
	}

	onMousePressed(btn, mx, my) {
		if (btn === LEFT) {
			this.isPanning = true
			this.panStartMouseX = mx
			this.panStartMouseY = my
			this.panStartX = this.panX
			this.panStartY = this.panY
		}
	}
	onMouseDragged(mx, my) {
		if (!this.isPanning) return
		this.panX = this.panStartX + (mx - this.panStartMouseX)
		this.panY = this.panStartY + (my - this.panStartMouseY)
	}
	onMouseReleased() {
		this.isPanning = false
	}

	drawLaneBoundary(R) {
		const L = this.track.L
		const C1 = { x: -L / 2, y: 0 }
		const C2 = { x: L / 2, y: 0 }

		beginShape()
		vertex(-L / 2, +R)
		vertex(+L / 2, +R)

		for (let i = 0; i <= 100; i++) {
			const a = Math.PI / 2 - (i / 100) * Math.PI
			vertex(C2.x + R * Math.cos(a), C2.y + R * Math.sin(a))
		}

		vertex(+L / 2, -R)
		vertex(-L / 2, -R)

		for (let i = 0; i <= 100; i++) {
			const a = -Math.PI / 2 - (i / 100) * Math.PI
			vertex(C1.x + R * Math.cos(a), C1.y + R * Math.sin(a))
		}
		endShape(CLOSE)
	}

	drawTrackBase() {
		noFill()
		stroke(this.trackStroke)
		strokeWeight(this.trackLineW_m)

		for (let lane = 1; lane <= this.track.lanes; lane++) {
			this.drawLaneBoundary(this.track.laneInnerRadius(lane))
			this.drawLaneBoundary(this.track.laneOuterRadius(lane))
		}
	}

	// トラックに直交する短い線（ティック）
	drawPerpTick(lane, s, halfLenM, col) {
		const eps = 0.05
		const p1 = this.track.sToXY(lane, s - eps)
		const p2 = this.track.sToXY(lane, s + eps)
		const p = this.track.sToXY(lane, s)

		let tx = p2.x - p1.x
		let ty = p2.y - p1.y
		const tn = Math.hypot(tx, ty) || 1
		tx /= tn
		ty /= tn
		const nx = -ty,
			ny = tx

		stroke(col)
		strokeWeight(this.markLineW_m)
		line(p.x - nx * halfLenM, p.y - ny * halfLenM, p.x + nx * halfLenM, p.y + ny * halfLenM)
	}

	drawMarks(marks) {
		// marks は sim 側で「何を描くか」を計算して渡す設計（研究ツール的に重要）
		// ここでは “描くだけ”
		for (const m of marks) {
			this.drawPerpTick(m.lane, m.s, m.halfLenM, m.color)
		}
	}

	drawEntities(sim) {
		const track = this.track

		const runnerDia = 0.6
		const batonDia = runnerDia

		const armTipByRunnerId = new Map()

		const gameInfo = sim.game?.enabled ? sim.game.getHUDInfo() : null
		const pinkIds = new Set()

		if (gameInfo?.canOfferNow && gameInfo.P && gameInfo.R) {
			pinkIds.add(gameInfo.P.id)
			pinkIds.add(gameInfo.R.id)
		}

		for (const r of sim.runners) {
			const eps = 0.05

			const c0 = track.sToXY(r.lane, r.s)

			const p1 = track.sToXY(r.lane, r.s - eps)
			const p2 = track.sToXY(r.lane, r.s + eps)
			let tx = p2.x - p1.x,
				ty = p2.y - p1.y
			const tn = Math.hypot(tx, ty) || 1
			tx /= tn
			ty /= tn

			const nx = -ty,
				ny = tx

			// 1/3走は内側、2/4走は外側
			const laneSide = r.leg === 1 || r.leg === 3 ? +1 : -1
			const lateral = track.laneW * 0.25 * laneSide

			const cx = c0.x + nx * lateral
			const cy = c0.y + ny * lateral

			// ランナー色
			if (pinkIds.has(r.id)) fill(255, 170, 210)
			else fill(255)

			noStroke()
			circle(cx, cy, runnerDia)

			// 腕
			const rightNormalX = -nx,
				rightNormalY = -ny
			const leftNormalX = nx,
				leftNormalY = ny

			const isRightArm = r.leg === 1 || r.leg === 3
			const ax = isRightArm ? rightNormalX : leftNormalX
			const ay = isRightArm ? rightNormalY : leftNormalY

			const baseX = cx + ax * (runnerDia / 2)
			const baseY = cy + ay * (runnerDia / 2)

			const phaseSign = isRightArm ? 1 : -1
			const armLen = r.l * Math.sin(r.phase) * phaseSign

			const tipX = baseX + tx * armLen
			const tipY = baseY + ty * armLen

			stroke(255, 255, 0)
			strokeWeight(0.16)
			line(baseX, baseY, tipX, tipY)

			armTipByRunnerId.set(r.id, { x: tipX, y: tipY })
		}

		// 各チームのバトンを全部描く
		for (const baton of sim.batons) {
			const tip = armTipByRunnerId.get(baton.holderId)

			noStroke()
			fill(160, 255, 0)

			if (tip) {
				circle(tip.x, tip.y, batonDia)
			} else {
				const bp = track.sToXY(baton.lane, baton.s)
				circle(bp.x, bp.y, batonDia)
			}
		}

		// 「はい！」表示（主人公チームのみ）
		if (sim.game?.enabled) {
			const now = performance.now()
			const info = sim.game.getHUDInfo()

			if (info.P && info.haiUntilMs > now) {
				const p = track.sToXY(info.P.lane, info.P.s)
				push()
				noStroke()
				fill(255)
				textSize(16)
				textAlign(CENTER, CENTER)
				text('はい！', p.x, p.y - 0.8)
				pop()
			}
		}

		for (const r of sim.runners) {
			if (!(r.waitCueUntilMs > performance.now())) continue
			const p = track.sToXY(r.lane, r.s)
			push()
			noStroke()
			fill(110, 220, 255)
			textSize(16)
			textAlign(CENTER, CENTER)
			text('待って！', p.x, p.y - 1.45)
			pop()
		}
	}
}
