import { TrackView } from './track.js'
import { Simulation } from './sim.js'
import { buildGUI } from './gui.js'

let view
let sim
let gui

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

	function rebuildGui() {
		if (gui) gui.destroy()
		gui = buildGUI(sim, cameraApi, rebuildGui)
	}
	rebuildGui()

	window.addEventListener('keydown', onKeyDown, { passive: false })

	function zoomToZoneIndex(idx) {
		const z = sim.zones[idx]
		if (!z) return

		const lane = 4
		const centerS = (z.start + z.end) / 2
		const p = sim.track.sToXY(lane, centerS)

		view.zoom = 2.6

		// world(p) が画面中心に来るように pan（px）を設定
		view.panX = -(p.x * view.zoom * view.pxPerM)
		view.panY = -(p.y * view.zoom * view.pxPerM)
	}

	function onKeyDown(e) {
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

		// ★ Enter/Return：2走が出走（go()）
		if (e.code === 'Enter') {
			e.preventDefault()
			// 召喚されている全レーンの leg2 を走らせる
			const lanes = Array.from(new Set(sim.runners.map((r) => r.lane)))
			for (const lane of lanes) sim.goLeg(lane, 2)
			return
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

	// baton（sはログ用。描画は腕先に出す）
	text(`baton holder = ${sim.baton.holderId}`, 14, y)
	y += 18

	for (const r of sim.runners) {
		const P = sim.track.lapLengthLaneCenter(r.lane)
		const s = ((r.s % P) + P) % P
		// text(`${r.id} (Lane ${r.lane}, Leg ${r.leg}) : d = ${r.dist.toFixed(2)} m`, 14, y)
		text(`${r.id} (Lane ${r.lane}, Leg ${r.leg}) : pos = ${r.dist.toFixed(2)} m`, 14, y)
		y += 18
	}
	pop()
}

function draw() {
	background(15)

	sim.step(1 / 60)

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
