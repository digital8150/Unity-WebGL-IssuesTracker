import { useEffect, useRef } from 'react';

const SITEKEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';
const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Module-level state so the script is only loaded once across all widget instances.
let scriptReady = false;
const pendingQueue = [];

function ensureScript() {
  if (scriptReady || document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    scriptReady = true;
    pendingQueue.forEach((fn) => fn());
    pendingQueue.length = 0;
  };
  document.head.appendChild(script);
}

function whenReady(fn) {
  if (scriptReady && window.turnstile) {
    fn();
  } else {
    pendingQueue.push(fn);
    ensureScript();
  }
}

/**
 * Cloudflare Turnstile widget.
 *
 * @param {object}   props
 * @param {function} props.onToken   called with the challenge token when passed
 * @param {function} [props.onExpire] called when the token expires (user must retry)
 * @param {'light'|'dark'|'auto'} [props.theme]
 * @param {React.MutableRefObject} [props.resetRef] assign .current = reset() fn after mount
 */
export default function TurnstileWidget({ onToken, onExpire, theme = 'auto', resetRef }) {
  const containerRef = useRef(null);
  const widgetIdRef  = useRef(null);
  const onTokenRef   = useRef(onToken);
  const onExpireRef  = useRef(onExpire);

  // Keep callback refs current without re-mounting the widget.
  useEffect(() => { onTokenRef.current  = onToken;  }, [onToken]);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    let mounted = true;

    whenReady(() => {
      if (!mounted || !containerRef.current || widgetIdRef.current != null) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITEKEY,
        theme,
        callback:           (token) => onTokenRef.current?.(token),
        'expired-callback': ()      => onExpireRef.current?.(),
        'error-callback':   ()      => onExpireRef.current?.(),
      });
    });

    return () => {
      mounted = false;
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose a reset handle so parent forms can call it after submission.
  useEffect(() => {
    if (!resetRef) return;
    resetRef.current = () => {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    };
  });

  return <div ref={containerRef} />;
}
