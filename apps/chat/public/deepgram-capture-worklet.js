// 麦克风采集 worklet：把 Float32 帧转成 linear16 PCM，postMessage 回主线程上行。
// AudioContext 以 16k 创建（浏览器自动重采样到该率），故无需手动降采样。
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length) {
      const pcm = new Int16Array(channel.length);
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);
