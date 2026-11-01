// Port helper: every listener this repo opens lives inside 4900-4949 (the app on 4901, mock listeners and tests on 4902-4949).
import { PORT_MIN, PORT_MAX } from './safety.js';

export async function listenInRange(server, host = '127.0.0.1', lo = 4902, hi = 4949) {
  if (lo < PORT_MIN || hi > PORT_MAX) throw new Error(`port range ${lo}-${hi} is outside ${PORT_MIN}-${PORT_MAX}`);
  const start = lo + Math.floor(Math.random() * (hi - lo + 1));
  for (let k = 0; k <= hi - lo; k++) {
    const port = lo + ((start - lo + k) % (hi - lo + 1));
    try {
      await new Promise((resolve, reject) => { const onErr = (e) => { server.off('listening', onOk); reject(e); }; const onOk = () => { server.off('error', onErr); resolve(); }; server.once('error', onErr); server.once('listening', onOk); server.listen(port, host); });
      return server.address().port;
    } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error(`no free port in ${lo}-${hi}`);
}
