import { TrackView } from './track.js'
import { Simulation } from './sim.js'
import { buildGUI } from './gui.js'

let view
let sim
let gui

let cameraState;
let hudState;
const TEAM_LABELS = 'ABCDEFGH'

function isPointerOverGUI() {
	const el = document.elementFromPoint(mouseX, mouseY)
	if (!el) return false
	return !!el.closest?.('.lil-gui')
}

function setup() {
	createCanvas(windowWidth, windowHeight)

	view = new TrackView()
	sim = new Simulation(view.track)

	// ===== カメラ切替API =====
	const cameraApi = {
		overview: () => {
			view.zoom = 1.0
			view.panX = 0
			view.panY = 0
		},
		zoomZone12: () => zoomToZoneIndex(0),
		zoomZone23: () => zoomToZoneIndex(1),
		zoomZone34: () => zoomToZoneIndex(2),
	}
	cameraState = {
		followBaton: false,
		followZoom: 2.6,
	}
	hudState = {
		showHUD: true,
	}

	function rebuildGui() {
		if (gui) gui.destroy()
		gui = buildGUI(sim, cameraApi, cameraState, hudState, rebuildGui)
	}
	rebuildGui()

	window.addEventListener('keydown', onKeyDown, { passive: false })

	function zoomToZoneIndex(idx) {
		// idx: 0=1-2, 1=2-3, 2=3-4
		const lane = sim.game?.playerLane ?? 4

		const centers = [95, 195, 295] // 80-110,180-210,280-310 の中心
		const d = centers[idx] ?? 95

		const p = sim.track.sToXY(lane, sim.raceDistToS(lane, d))

		view.zoom = 2.6
		view.panX = -(p.x * view.zoom * view.pxPerM)
		view.panY = -(p.y * view.zoom * view.pxPerM)
	}

	function onKeyDown(e) {
		if (e.code === 'KeyR') {
			e.preventDefault()
			sim.resetRace()
			return
		}

		// Failure中は gameController 側で「何かキーでreset」する
		if (sim.game?.enabled && sim.failureMessage) {
			sim.game.onKeyDown(e)
			return
		}

		if (e.code === 'Space') {
			e.preventDefault()
			sim.playPauseToggle()
			return
		}

		if (e.code === 'ArrowRight') {
			e.preventDefault()
			sim.stepForwardOneFrame()
			return
		}

		if (e.code === 'ArrowLeft') {
			e.preventDefault()
			sim.stepBackwardOneFrame()
			return
		}

		if (sim.game?.enabled) {
			sim.game.onKeyDown(e)
		}
	}

}

function drawHUD() {
	if (!hudState?.showHUD) return

	push()
	resetMatrix()
	textFont('monospace')
	textAlign(LEFT, TOP)

	const pad = 12
	const gap = 10
	const cardW = Math.min(420, Math.max(320, width - pad * 2))
	const headerLines = buildHUDHeaderLines()
	const headerH = 18 + headerLines.length * 18

	drawHUDPanel(pad, pad, cardW, headerH)
	let y = pad + 10
	for (const line of headerLines) {
		drawHUDTextLine(line, pad + 12, y)
		y += 18
	}

	const cards = buildHUDCards()
	if (cards.length > 0) {
		const cardH = 192
		const startY = pad + headerH + gap
		const cardsPerCol = Math.max(1, Math.floor((height - startY - pad) / (cardH + gap)))

		for (let i = 0; i < cards.length; i++) {
			const col = Math.floor(i / cardsPerCol)
			const row = i % cardsPerCol
			const x = pad + col * (cardW + gap)
			const y0 = startY + row * (cardH + gap)
			drawHUDCard(cards[i], x, y0, cardW, cardH)
		}
	}

	pop()
}

function buildHUDHeaderLines() {
	const stateLabel = sim.player.paused ? 'PAUSED' : 'PLAY'
	const playerTeam = laneToTeamLabel(sim.game?.playerLane ?? null)
	const summonedTeams = Array.from(new Set(sim.runners.map((r) => laneToTeamLabel(r.lane)))).join(', ')

	const lines = [
		{ text: `Relay Simulator HUD`, color: [255, 255, 255] },
		{ text: `t=${sim.t.toFixed(2)} s  |  speed=x${sim.player.speed.toFixed(1)}  |  state=${stateLabel}`, color: [220, 220, 220] },
		{ text: `player=${playerTeam}  |  summoned=${summonedTeams || '-'}`, color: [180, 210, 255] },
		{ text: `mode=${sim.game?.enabled ? 'game' : 'non-game'}  |  sync=${sim.interpersonal.enabled ? 'on' : 'off'}`, color: [170, 235, 210] },
	]

	if (sim.failureMessage) {
		lines.push({ text: `Failure: ${sim.failureMessage}  |  press any key to reset`, color: [255, 110, 110] })
	}

	if (sim.game?.enabled && sim.game.successMessage) {
		lines.push({ text: `Success!`, color: [110, 255, 150] })
	}

	return lines
}

function buildHUDCards() {
	const lanes = Array.from(new Set(sim.runners.map((r) => r.lane))).sort((a, b) => a - b)
	const playerLane = sim.game?.enabled ? sim.game.playerLane : null
	const gameInfo = sim.game?.enabled ? sim.game.getHUDInfo() : null

	lanes.sort((a, b) => {
		if (a === playerLane) return -1
		if (b === playerLane) return 1
		return a - b
	})

	return lanes.map((lane) => {
		const baton = sim.getBatonForLane(lane)
		const P = baton ? sim.runners.find((r) => r.id === baton.holderId) || null : null
		const R = P ? sim.runners.find((r) => r.lane === lane && r.leg === P.leg + 1) || null : null
		const isPlayer = lane === playerLane

		return {
			lane,
			team: laneToTeamLabel(lane),
			isPlayer,
			P,
			R,
			gameInfo: isPlayer ? gameInfo : null,
		}
	})
}

function drawHUDCard(card, x, y, w, h) {
	const headerColor = card.isPlayer ? [255, 235, 140] : [220, 220, 220]
	const bodyColor = [205, 215, 225]
	const accentColor = card.isPlayer ? [255, 210, 120] : [150, 185, 220]

	drawHUDPanel(x, y, w, h)

	fill(...headerColor)
	noStroke()
	textSize(15)
	text(`${card.team} / lane ${card.lane}${card.isPlayer ? ' / PLAYER' : ''}`, x + 12, y + 10)

	fill(...accentColor)
	textSize(12)
	text(`baton holder: ${card.P ? `leg${card.P.leg}` : '-'}`, x + 12, y + 30)

	let yy = y + 50
	drawRunnerHUDBlock('P', card.P, x + 12, yy, bodyColor)
	yy += 62
	drawRunnerHUDBlock('R', card.R, x + 12, yy, bodyColor)
	yy += 48

	if (card.gameInfo) {
		fill(180, 220, 255)
		textSize(12)
		const offerLabel = card.gameInfo.canOfferNow ? 'yes' : 'no'
		text(`game: p=${card.gameInfo.pStage}(${card.gameInfo.pStageLabel})  r=${card.gameInfo.rStage}(${card.gameInfo.rStageLabel})  offer=${offerLabel}`, x + 12, yy)
	}
}

function drawRunnerHUDBlock(label, runner, x, y, colorValue) {
	fill(...colorValue)
	noStroke()
	textSize(12)

	if (!runner) {
		text(`${label}: none`, x, y)
		return
	}

	text(
		`${label}: leg${runner.leg}  race=${runner.dist.toFixed(1)}m  run=${runner.runDistance.toFixed(1)}m  phase=${runner.phase.toFixed(2)}`,
		x,
		y,
	)
	text(
		`   omega=${runner.omega.toFixed(2)} (ind ${runner.individualOmegaComponent.toFixed(2)} + inter ${runner.interpersonalOmegaComponent.toFixed(2)}, N=${runner.syncPartnerCount})`,
		x,
		y + 16,
	)
	text(
		`   pitch=${runner.pitch.toFixed(2)}  stride=${runner.stride.toFixed(2)} (ind ${runner.individualStrideComponent.toFixed(2)} x inter ${runner.interpersonalStrideFactor.toFixed(2)} x coef ${runner.strideScale.toFixed(2)})`,
		x,
		y + 32,
	)

	if (label === 'P' && (runner.waitCueActive || runner.tauToReceiver !== null || runner.tauToZoneEnd !== null || runner.tauToReceiverRate !== null)) {
		text(
			`   tauPR=${formatHudNumber(runner.tauToReceiver)}  tauRB=${formatHudNumber(runner.tauToZoneEnd)}  dtau=${formatHudNumber(runner.tauToReceiverRate)}${runner.waitCueActive ? '  WAIT' : ''}`,
			x,
			y + 48,
		)
	}
}

function drawHUDPanel(x, y, w, h) {
	stroke(255, 255, 255, 60)
	strokeWeight(1)
	fill(10, 18, 28, 210)
	rect(x, y, w, h, 10)
}

function drawHUDTextLine(line, x, y) {
	fill(...line.color)
	noStroke()
	textSize(12)
	text(line.text, x, y)
}

function laneToTeamLabel(lane) {
	if (!lane) return '-'
	return TEAM_LABELS[lane - 1] ?? `Lane ${lane}`
}

function formatHudNumber(value) {
	if (value === null || value === undefined) return '-'
	if (value === Infinity) return 'inf'
	if (!Number.isFinite(value)) return '-'
	return value.toFixed(2)
}

function draw() {
	background(15)

	sim.step(1 / 60)
	if (cameraState.followBaton && sim.game?.enabled) {
		const baton = sim.getBatonForLane(sim.game.playerLane)
		if (baton) {
			const holder = sim.runners.find((r) => r.id === baton.holderId)
			if (holder) {
				const p = sim.track.sToXY(holder.lane, holder.s)
				view.zoom = cameraState.followZoom
				view.panX = -(p.x * view.zoom * view.pxPerM)
				view.panY = -(p.y * view.zoom * view.pxPerM)
			}
		}
	}

	view.beginDraw()
	view.drawTrackBase()
	view.drawMarks(sim.getVisibleMarks())
	view.drawEntities(sim) // ★ 見た目はtrack.js側で更新
	view.endDraw()

	drawHUD()
}

// --- カメラ操作（GUI上は無効） ---
function mouseWheel(event) {
	if (isPointerOverGUI()) return true

	const isZoomGesture = event.ctrlKey || event.metaKey
	if (isZoomGesture) {
		view.zoomAtMouse(event.deltaY > 0 ? 1 / view.zoomStep : view.zoomStep)
		return false
	}
	return true
}

function mousePressed() {
	if (isPointerOverGUI()) return
	view.onMousePressed(mouseButton, mouseX, mouseY)
}

function mouseDragged() {
	if (isPointerOverGUI()) return
	view.onMouseDragged(mouseX, mouseY)
}

function mouseReleased() {
	view.onMouseReleased()
}

function windowResized() {
	resizeCanvas(windowWidth, windowHeight)
}

window.setup = setup
window.draw = draw
window.mouseWheel = mouseWheel
window.mousePressed = mousePressed
window.mouseDragged = mouseDragged
window.mouseReleased = mouseReleased
window.windowResized = windowResized
