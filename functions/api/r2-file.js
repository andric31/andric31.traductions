import {serveMedia} from './_r2_media.js';
export function onRequest(context) {
  return serveMedia(context,new URL(context.request.url).searchParams.get('key')||'',true);
}
