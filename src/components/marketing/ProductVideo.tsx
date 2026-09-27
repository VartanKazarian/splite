import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

/*
 * El video de 21 segundos: QR, reparto, conciliación y panel.
 *
 * Dos cortes del mismo video. En el teléfono, un 16:9 queda en 200 px de alto
 * y no se lee nada, así que ahí va uno 4:5. El corte se elige en el cliente,
 * con el mismo punto de corte que `md:` de Tailwind; mientras tanto (y en el
 * servidor) se ve la imagen fija correcta gracias a <picture>.
 *
 * Arranca en silencio y en bucle cuando entra en pantalla, porque los
 * navegadores no dejan reproducir con sonido sin que la persona toque algo.
 * «Ver con sonido» lo reinicia desde el principio con la música. Quien pide
 * menos movimiento ve la imagen fija y un botón para reproducirlo.
 */
const MOBILE = "(max-width: 767px)";
const SOURCES = {
  wide: { video: "/video/splite-demo-16x9.mp4", poster: "/video/splite-demo-16x9.jpg" },
  tall: { video: "/video/splite-demo-4x5.mp4", poster: "/video/splite-demo-4x5.jpg" },
} as const;

export function ProductVideo() {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cut, setCut] = useState<keyof typeof SOURCES | null>(null);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);
  // Si la persona lo pausó, no se lo volvemos a reproducir al hacer scroll.
  const userPaused = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pick = () => setCut(mq.matches ? "tall" : "wide");
    const motion = () => setReduced(rm.matches);
    pick();
    motion();
    mq.addEventListener("change", pick);
    rm.addEventListener("change", motion);
    return () => {
      mq.removeEventListener("change", pick);
      rm.removeEventListener("change", motion);
    };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), {
      threshold: 0.4,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Reproduce en silencio al entrar en pantalla; pausa al salir.
  useEffect(() => {
    const v = video.current;
    if (!v || !cut) return;
    if (inView && !reduced && !userPaused.current) {
      setStarted(true);
      void v.play().catch(() => setPlaying(false));
    } else if (!inView) {
      v.pause();
    }
  }, [inView, reduced, cut]);

  function withSound() {
    const v = video.current;
    if (!v) return;
    userPaused.current = false;
    setStarted(true);
    v.muted = false;
    v.currentTime = 0;
    setSound(true);
    void v.play().catch(() => setPlaying(false));
  }

  function toggleMute() {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setSound(!v.muted);
  }

  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      userPaused.current = false;
      setStarted(true);
      void v.play().catch(() => setPlaying(false));
    } else {
      userPaused.current = true;
      v.pause();
    }
  }

  const src = cut ? SOURCES[cut] : null;

  return (
    <div
      ref={box}
      className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-secondary shadow-[0_24px_60px_-28px_rgba(34,31,27,0.35)] md:aspect-video md:max-w-5xl"
    >
      <picture>
        <source media={MOBILE} srcSet={SOURCES.tall.poster} />
        <img
          src={SOURCES.wide.poster}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>

      {src && (
        <video
          key={src.video}
          ref={video}
          src={started || inView ? src.video : undefined}
          poster={src.poster}
          muted={!sound}
          loop
          playsInline
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={sound ? togglePlay : withSound}
          aria-label="Video de 21 segundos: el cliente escanea el QR de la mesa, elige lo que consumió y paga su parte; el pago se concilia con el banco y el restaurante lo ve en su panel."
          className="absolute inset-0 h-full w-full cursor-pointer object-cover"
        />
      )}

      {reduced && !started ? (
        <button
          type="button"
          onClick={withSound}
          className="absolute inset-0 grid place-items-center bg-foreground/10 transition-colors hover:bg-foreground/15"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-background px-5 py-3 text-[15px] font-semibold shadow-lg">
            <Play className="h-4 w-4 fill-current" /> Ver el video (21 s)
          </span>
        </button>
      ) : (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 md:inset-x-5 md:bottom-5">
          <button
            type="button"
            onClick={sound ? toggleMute : withSound}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background/95 px-4 text-[14px] font-semibold shadow-md backdrop-blur transition-transform hover:-translate-y-0.5"
          >
            {sound ? (
              <>
                <VolumeX className="h-4 w-4" /> Silenciar
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" /> Ver con sonido
              </>
            )}
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pausar el video" : "Reproducir el video"}
            className="grid h-11 w-11 place-items-center rounded-full bg-background/95 shadow-md backdrop-blur"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
        </div>
      )}
    </div>
  );
}
