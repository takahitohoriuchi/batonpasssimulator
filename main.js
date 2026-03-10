import { TrackView } from './track.js'
import { Simulation } from './sim.js'
import { buildGUI } from './gui.js'

let view
let sim
let gui

let cameraState;

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

	function rebuildGui() {
		if (gui) gui.destroy()
		gui = buildGUI(sim, cameraApi, cameraState, rebuildGui)
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
	push()
	resetMatrix()
	noStroke()
	fill(220)
	textSize(14)

	let y = 22
	text(`t = ${sim.t.toFixed(2)} s  |  speed = x${sim.player.speed.toFixed(1)}  |  ${sim.player.paused ? 'PAUSED' : 'PLAY'}`, 14, y)
	y += 18

	if (sim.failureMessage) {
		fill(255, 80, 80)
		text(`Failure: ${sim.failureMessage}`, 14, y)
		y += 18
		fill(220)
		text(`Press any key to reset`, 14, y)
		y += 18
	}

	if (sim.game?.enabled) {
		const info = sim.game.getHUDInfo()

		if (info.successMessage) {
			fill(80, 255, 120)
			text(`Success!`, 14, y)
			y += 18
			fill(220)
		}

		if (info.P && info.R) {
			text(`P = leg${info.P.leg}, R = leg${info.R.leg}  (lane ${info.lane})`, 14, y)
			y += 18
			text(`P pos = ${info.P.dist.toFixed(2)} m  |  phase = ${info.P.phase.toFixed(2)} rad  |  pStage = ${info.pStage} (${info.pStageLabel})`, 14, y)
			y += 18
			text(`R pos = ${info.R.dist.toFixed(2)} m  |  phase = ${info.R.phase.toFixed(2)} rad  |  rStage = ${info.rStage} (${info.rStageLabel})`, 14, y)
			y += 18
			text(`canOffer = ${info.canOfferNow}`, 14, y)
			y += 18
		}
	}

	pop()
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
	view.drawMarks(sim.marks)
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
