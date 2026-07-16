let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function beep(freq: number, duration = 0.1, type: OscillatorType = "sine", gainVal = 0.15) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainVal;
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export const sounds = {
  success: () => { beep(880, 0.08); setTimeout(() => beep(1320, 0.1), 80); },
  error: () => beep(220, 0.25, "square", 0.18),
  scan: () => beep(1200, 0.06, "sine", 0.12),
  divergente: () => {
    // som negativo mais forte: sequência de tons graves tipo buzzer
    beep(220, 0.18, "square", 0.22);
    setTimeout(() => beep(180, 0.22, "square", 0.22), 200);
    setTimeout(() => beep(150, 0.45, "square", 0.24), 440);
  },
};
