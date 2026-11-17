const arena = document.querySelector('#arena')
const cursor = document.querySelector('#cursor')
const slider = document.querySelector('#frequency-slider')
const coolButton = document.querySelector('#cool-button')
const gcButton = document.querySelector('#gc-button')
const restartButton = document.querySelector('#restart-button')
const resultModal = document.querySelector('#result-modal')
const shareButton = document.querySelector('#share-button')
const closeResult = document.querySelector('#close-result')

const ui = {
  clock: document.querySelector('#clock-value'),
  clockMeter: document.querySelector('#clock-meter'),
  multiplier: document.querySelector('#multiplier-value'),
  temp: document.querySelector('#temp-value'),
  tempMeter: document.querySelector('#temp-meter'),
  leak: document.querySelector('#leak-value'),
  leakMeter: document.querySelector('#leak-meter'),
  gcStatus: document.querySelector('#gc-status'),
  score: document.querySelector('#score-value'),
  combo: document.querySelector('#combo-value'),
  packetCount: document.querySelector('#packet-count'),
  mode: document.querySelector('#frequency-mode'),
  sessionState: document.querySelector('#session-state'),
  sessionTime: document.querySelector('#session-time'),
  cooldownOverlay: document.querySelector('#cooldown-overlay'),
  cooldownValue: document.querySelector('#cooldown-value'),
  crashOverlay: document.querySelector('#crash-overlay'),
  finalScore: document.querySelector('#final-score'),
  finalClock: document.querySelector('#final-clock'),
  finalPackets: document.querySelector('#final-packets'),
  finalEvents: document.querySelector('#final-events'),
  finalTitle: document.querySelector('#final-title'),
}

const startTime = performance.now()
let frameId
let lastFrame = startTime
let spawnTimer = 0
let id = 0
let audioContext

const state = {
  frequency: .45,
  temp: 18,
  leak: 0,
  score: 0,
  combo: 1,
  packetsCleared: 0,
  thermalEvents: 0,
  peakClock: 1,
  cooldown: 0,
  cooling: false,
  crashed: false,
  cursorTarget: { x: 50, y: 50 },
  cursorPosition: { x: 50, y: 50 },
  packets: [],
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function setPointerPosition(event) {
  const rect = arena.getBoundingClientRect()
  state.cursorTarget.x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
  state.cursorTarget.y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
}

function createAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)()
  return audioContext
}

function thermalAlarm() {
  try {
    const audio = createAudio()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(90, audio.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(24, audio.currentTime + .45)
    gain.gain.setValueAtTime(.035, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .45)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + .45)
  } catch {
    // Audio is an enhancement and can be unavailable until user interaction.
  }
}

function spawnPacket() {
  if (state.cooldown || state.crashed || state.packets.length > 13) return
  const error = Math.random() < .16 + state.leak / 700
  const size = error ? 46 + Math.random() * 20 : 22 + Math.random() * 18
  const packet = {
    id: ++id,
    error,
    x: 8 + Math.random() * 84,
    y: 10 + Math.random() * 80,
    size,
    age: 0,
    ttl: error ? 5.2 : 3.8 + Math.random() * 2,
    velocity: error ? (Math.random() - .5) * 4 : 0,
  }
  const element = document.createElement('div')
  element.className = `packet${error ? ' error' : ''}`
  element.style.width = `${size}px`
  element.style.height = `${size}px`
  element.innerHTML = `<span class="packet-code">${error ? 'ERR' : '0x' + packet.id.toString(16).padStart(2, '0')}</span>`
  packet.element = element
  arena.appendChild(element)
  state.packets.push(packet)
}

function showHit(packet, points) {
  const hit = document.createElement('span')
  hit.className = 'packet-hit'
  hit.textContent = `+${points}`
  hit.style.left = `${packet.x}%`
  hit.style.top = `${packet.y}%`
  arena.appendChild(hit)
  window.setTimeout(() => hit.remove(), 520)
}

function removePacket(packet) {
  packet.element.remove()
  state.packets = state.packets.filter((item) => item.id !== packet.id)
}

function processPacket(packet) {
  const multiplier = 1 + state.frequency * 2.8
  const points = Math.round((packet.error ? 18 : 42) * multiplier * state.combo)
  state.score += points
  state.packetsCleared += 1
  state.combo = clamp(state.combo + (packet.error ? 0 : .25), 1, 9.99)
  state.temp += packet.error ? 12 + state.frequency * 10 : 1.2 + state.frequency * 3
  if (packet.error) state.leak += 18
  showHit(packet, points)
  removePacket(packet)
}

function checkCursorHits() {
  state.packets.slice().forEach((packet) => {
    const dx = state.cursorPosition.x - packet.x
    const dy = state.cursorPosition.y - packet.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const hitRadius = packet.size / Math.max(arena.clientWidth, arena.clientHeight) * 100 * 1.2
    if (distance < hitRadius) processPacket(packet)
  })
}

function expirePackets(delta) {
  state.packets.slice().forEach((packet) => {
    packet.age += delta
    if (packet.error) packet.x += packet.velocity * delta
    if (packet.age > packet.ttl) {
      if (packet.error) state.score = Math.max(0, state.score - 80)
      state.combo = Math.max(1, state.combo - .2)
      removePacket(packet)
    }
  })
}

function triggerCooldown() {
  state.thermalEvents += 1
  state.temp = 86
  state.cooldown = 5
  state.frequency = 0
  slider.value = '0'
  ui.cooldownOverlay.classList.add('active')
  ui.sessionState.textContent = 'THERMAL LOCK'
  thermalAlarm()
  if (state.thermalEvents >= 3) crash()
}

function crash() {
  state.crashed = true
  state.cooldown = 0
  state.packets.forEach((packet) => packet.element.remove())
  state.packets = []
  ui.cooldownOverlay.classList.remove('active')
  ui.crashOverlay.classList.add('active')
  ui.sessionState.textContent = 'SYSTEM CRASHED'
  showResult()
}

function showResult() {
  const title = state.score > 5000 ? 'SILICON SAVANT' : state.score > 2200 ? 'THERMAL RISK-TAKER' : 'SYSTEM OPERATOR'
  ui.finalScore.textContent = Math.floor(state.score).toString().padStart(6, '0')
  ui.finalClock.textContent = `${state.peakClock.toFixed(2)} GHz`
  ui.finalPackets.textContent = state.packetsCleared.toString().padStart(2, '0')
  ui.finalEvents.textContent = state.thermalEvents.toString().padStart(2, '0')
  ui.finalTitle.textContent = title
  window.setTimeout(() => resultModal.classList.add('open'), 900)
}

function collectGarbage() {
  if (state.leak < 35 || state.cooldown || state.crashed) return
  state.leak = 0
  state.temp = Math.max(18, state.temp - 8)
  gcButton.classList.remove('ready')
  gcButton.disabled = true
  ui.gcStatus.textContent = 'COMPLETE'
  window.setTimeout(() => { ui.gcStatus.textContent = 'STANDBY' }, 1000)
}

function updateUI(elapsed) {
  const clock = 1 + state.frequency * 4
  const mode = state.frequency < .28 ? 'SAFE / SLOW' : state.frequency > .78 ? 'REDLINE' : 'BALANCED'
  ui.clock.textContent = `${clock.toFixed(2)} GHz`
  ui.clockMeter.style.width = `${state.frequency * 100}%`
  ui.multiplier.textContent = `${(1 + state.frequency * 2.8).toFixed(2)}×`
  ui.temp.textContent = `${Math.round(state.temp)}°C`
  ui.tempMeter.style.width = `${state.temp}%`
  ui.leak.textContent = `${Math.round(state.leak)}%`
  ui.leakMeter.style.width = `${state.leak}%`
  ui.score.textContent = Math.floor(state.score).toString().padStart(6, '0')
  ui.combo.textContent = `COMBO ×${state.combo.toFixed(1)}`
  ui.packetCount.textContent = `${state.packets.length.toString().padStart(2, '0')} PACKETS`
  ui.mode.textContent = mode
  ui.mode.style.color = mode === 'REDLINE' ? 'var(--red)' : mode === 'SAFE / SLOW' ? 'var(--cyan)' : 'var(--green)'
  ui.sessionTime.textContent = new Date(elapsed).toISOString().slice(14, 19)
  ui.tempMeter.style.backgroundColor = state.temp > 80 ? 'var(--red)' : state.temp > 55 ? 'var(--yellow)' : 'var(--yellow)'
  ui.leakMeter.style.backgroundColor = state.leak > 70 ? 'var(--red)' : 'var(--cyan)'
  ui.gcStatus.textContent = state.leak >= 35 ? 'REQUIRED' : 'STANDBY'
  gcButton.disabled = state.leak < 35 || state.cooldown || state.crashed
  gcButton.classList.toggle('ready', state.leak >= 35 && !state.cooldown && !state.crashed)
  if (state.cooldown > 0) ui.cooldownValue.textContent = state.cooldown.toFixed(1)
}

function update(delta, elapsed) {
  if (state.crashed) return
  if (state.cooldown > 0) {
    state.cooldown = Math.max(0, state.cooldown - delta)
    if (state.cooldown === 0) {
      ui.cooldownOverlay.classList.remove('active')
      ui.sessionState.textContent = 'SYSTEM ONLINE'
    }
  } else {
    const heatRate = .8 + state.frequency * 2.8 + state.leak / 180
    state.temp += heatRate * delta
    state.leak += (.7 + state.frequency * .9) * delta
    if (state.temp >= 100) triggerCooldown()
    if (state.leak >= 100) crash()
    spawnTimer += delta
    const spawnEvery = Math.max(.32, .95 - state.frequency * .5)
    if (spawnTimer > spawnEvery) {
      spawnTimer = 0
      spawnPacket()
    }
  }

  const lag = clamp(.05 + state.frequency * .19 + state.leak / 700, .05, .34)
  state.cursorPosition.x += (state.cursorTarget.x - state.cursorPosition.x) * (1 - Math.pow(lag, delta * 60))
  state.cursorPosition.y += (state.cursorTarget.y - state.cursorPosition.y) * (1 - Math.pow(lag, delta * 60))
  cursor.style.left = `${state.cursorPosition.x}%`
  cursor.style.top = `${state.cursorPosition.y}%`
  if (!state.cooldown) {
    checkCursorHits()
    expirePackets(delta)
  }
  state.peakClock = Math.max(state.peakClock, 1 + state.frequency * 4)
  updateUI(elapsed)
}

function loop(now) {
  const delta = Math.min(.05, (now - lastFrame) / 1000)
  lastFrame = now
  update(delta, now - startTime)
  frameId = requestAnimationFrame(loop)
}

function reset() {
  cancelAnimationFrame(frameId)
  state.frequency = .45
  state.temp = 18
  state.leak = 0
  state.score = 0
  state.combo = 1
  state.packetsCleared = 0
  state.thermalEvents = 0
  state.peakClock = 1
  state.cooldown = 0
  state.cooling = false
  state.crashed = false
  state.packets.forEach((packet) => packet.element.remove())
  state.packets = []
  slider.value = '45'
  ui.crashOverlay.classList.remove('active')
  resultModal.classList.remove('open')
  ui.sessionState.textContent = 'SYSTEM ONLINE'
  lastFrame = performance.now()
  frameId = requestAnimationFrame(loop)
}

slider.addEventListener('input', () => {
  if (!state.cooldown && !state.crashed) state.frequency = Number(slider.value) / 100
})

arena.addEventListener('pointermove', setPointerPosition)
arena.addEventListener('pointerdown', (event) => {
  setPointerPosition(event)
  try { createAudio().resume() } catch {}
})

function setCooling(active) {
  state.cooling = active
  coolButton.classList.toggle('active', active)
}

coolButton.addEventListener('pointerdown', () => setCooling(true))
window.addEventListener('pointerup', () => setCooling(false))
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault()
    if (!state.crashed) setCooling(true)
  }
  if (event.key.toLowerCase() === 'g') collectGarbage()
})
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') setCooling(false)
})

const originalUpdate = update
update = function updateWithCooling(delta, elapsed) {
  if (state.cooling && !state.cooldown && !state.crashed) {
    state.temp = Math.max(18, state.temp - 12 * delta)
    state.frequency = 0
    slider.value = '0'
  }
  originalUpdate(delta, elapsed)
}

gcButton.addEventListener('click', collectGarbage)
restartButton.addEventListener('click', reset)
closeResult.addEventListener('click', () => resultModal.classList.remove('open'))
shareButton.addEventListener('click', () => {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 628
  const context = canvas.getContext('2d')
  context.fillStyle = '#050505'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#242420'
  context.strokeRect(38, 38, canvas.width - 76, canvas.height - 76)
  context.fillStyle = '#777772'
  context.font = '18px monospace'
  context.fillText('OVERCLOCK // FINAL ASSESSMENT', 76, 91)
  context.fillStyle = '#f0f0ec'
  context.font = '900 118px Arial'
  context.fillText('CORE', 76, 255)
  context.fillStyle = '#ff3d4d'
  context.fillText('OFFLINE.', 76, 365)
  context.fillStyle = '#242420'
  context.fillRect(76, 408, 1048, 1)
  context.fillStyle = '#777772'
  context.font = '16px monospace'
  context.fillText('FINAL SCORE', 76, 455)
  context.fillStyle = '#f0f0ec'
  context.font = '26px monospace'
  context.fillText(ui.finalScore.textContent, 76, 492)
  context.fillStyle = '#777772'
  context.font = '16px monospace'
  context.fillText('PEAK CLOCK', 355, 455)
  context.fillStyle = '#f0f0ec'
  context.font = '26px monospace'
  context.fillText(ui.finalClock.textContent, 355, 492)
  context.fillStyle = '#f7cf4d'
  context.font = '16px monospace'
  context.fillText(ui.finalTitle.textContent, 76, 560)
  const link = document.createElement('a')
  link.download = 'overclock-final-assessment.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
})

frameId = requestAnimationFrame(loop)
