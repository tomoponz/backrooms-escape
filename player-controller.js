// One physics step for movement, stamina and footstep distance. No DOM/audio.
export const PLAYER_RULES = Object.freeze({drain:16, recoveryDelay:1.4, movingRecovery:5, restingRecovery:12, sprintRecovery:25});

export function advancePlayer({nav, position, keys, yaw, pitch = 0, dt, speeds, stamina, staminaDelay, sprintReady, footClock}) {
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .05)) : 0;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const length = Math.hypot(forward, right);
  const wantsSprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && sprintReady && length > 0;
  const speed = wantsSprint ? speeds.sprint : speeds.walk;
  let travel = 0;
  if (length && step) {
    const before = [...position];
    nav.move(position, (Math.sin(yaw)*forward + Math.cos(yaw)*right)/length*speed*step,
      (-Math.cos(yaw)*forward + Math.sin(yaw)*right)/length*speed*step);
    travel = Math.hypot(position[0]-before[0], position[1]-before[1]);
  }
  const moving = travel > .00001, running = wantsSprint && moving;
  yaw += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')))*2.2*step;
  pitch = Math.max(-1.25, Math.min(1.25, (Number.isFinite(pitch) ? pitch : 0) +
    (Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown')))*2.2*step));
  if (running) {
    staminaDelay = PLAYER_RULES.recoveryDelay;
    stamina = Math.max(0, stamina - PLAYER_RULES.drain*step);
  } else {
    staminaDelay = Math.max(0, staminaDelay-step);
    if (staminaDelay === 0) stamina = Math.min(100, stamina + (moving ? PLAYER_RULES.movingRecovery : PLAYER_RULES.restingRecovery)*step);
  }
  if (stamina <= 0) sprintReady = false;
  else if (stamina >= PLAYER_RULES.sprintRecovery) sprintReady = true;
  footClock += travel;
  const stride = running ? 1.45 : 1.35;
  const footstep = moving && footClock >= stride;
  if (footstep) footClock %= stride;
  return {yaw, pitch, stamina, staminaDelay, sprintReady, footClock, moving, running, footstep, travel};
}
