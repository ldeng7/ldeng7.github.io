let goMemArr, fbOffset, fbSize, canvasCtx, canvasData

window.copyFromJsArr = (arr, ptr) => {
  goMemArr.set(arr, ptr)
}
window.setFrameBuffer = (ptr, sz) => {
  fbOffset = ptr
  fbSize = sz
}
window.updateScreen = () => {
  canvasData.data.set(goMemArr.slice(fbOffset, fbOffset + fbSize))
  canvasCtx.putImageData(canvasData, 0, 0)
}
window.goFuncs = {}

const go = new Go()
WebAssembly.instantiateStreaming(fetch("go_main.wasm"), go.importObject).
  then(res => {
    goMemArr = new Uint8Array(res.instance.exports.mem.buffer)
    go.run(res.instance)
  })

let onEmuStart = () => {
  document.onkeydown = event => {
    window.goFuncs.onKey(event.code, true)
  }
  document.onkeyup = event => {
    window.goFuncs.onKey(event.code, false)
  }
}

window.onload = () => {
  let fileElem = document.getElementById("file-input")
  fileElem.addEventListener("change", event => {
    let reader = new FileReader()
    reader.onload = event => {
      let fileArr = new Uint8Array(event.target.result)
      let ret = window.goFuncs.start(fileArr, fileArr.length)
      if (ret === true) {
        ret = "running."
        fileElem.hidden = true
        onEmuStart()
      }
      document.getElementById("msg").innerText = ret
    }
    if (event.target.files.length > 0) {
      reader.readAsArrayBuffer(event.target.files[0])
    }
  })
  canvasCtx = document.getElementById("screen").getContext("2d", {alpha: false})
  canvasData = canvasCtx.createImageData(272, 240)
}
