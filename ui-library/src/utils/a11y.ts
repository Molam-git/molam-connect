export function isEnterKey(e: React.KeyboardEvent){
  return e.key === "Enter" || e.keyCode === 13;
}
export function isSpaceKey(e: React.KeyboardEvent){
  return e.key === " " || e.key === "Spacebar" || e.keyCode === 32;
}

