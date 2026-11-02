import { useEffect, useRef, useState } from "react"
import { Menu, Upload, X } from "lucide-react"
import { runTryOn, login, signup, getToken } from "./api"

const videos = [
  {
    label: "Golden Hour",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081127_0992a171-d3c6-4978-8213-0ec5df8b6d63.mp4",
  },
  {
    label: "Still Water",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_092026_dd05b805-ea0f-40b2-8c52-332b88502592.mp4",
  },
  {
    label: "Deep Woods",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_081042_df7202bf-bd80-4b2b-bbc6-1f09ba2870e9.mp4",
  },
  {
    label: "Quiet Dawn",
    src: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260702_080959_4cac5234-3573-464e-a5b7-76b94b8a7d61.mp4",
  },
] as const

const navLinks = ["Login"]
const stats = ["Intentional-First Design"]

export default function App() {
  const [view, setView] = useState<"hero" | "results" | "login">("hero")
  const [activeVideo, setActiveVideo] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [personFile, setPersonFile] = useState<File | null>(null)
  const [garmentFile, setGarmentFile] = useState<File | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [tryOnError, setTryOnError] = useState("")
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup")
  const [authError, setAuthError] = useState("")
  const [authBusy, setAuthBusy] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDark = activeVideo === 2

  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current)
    }
  }, [])

  const selectVideo = (index: number) => {
    if (index === activeVideo || isTransitioning) return

    setActiveVideo(index)
    setIsTransitioning(true)
    transitionTimer.current = setTimeout(() => {
      setIsTransitioning(false)
      transitionTimer.current = null
    }, 1000)
  }

  const handleTryOn = async () => {
    setMenuOpen(false)
    if (!getToken()) {
      setAuthMode("login")
      setView("login")
      return
    }
    if (!personFile || !garmentFile) {
      setView("hero")
      setTryOnError("Please upload both your photo and a clothes photo.")
      return
    }
    setTryOnError("")
    setResultUrl(null)
    setStatus("loading")
    setView("results")
    try {
      setResultUrl(await runTryOn(personFile, garmentFile))
      setStatus("idle")
    } catch (e) {
      setTryOnError((e as Error).message)
      setStatus("error")
    }
  }

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault()
    setAuthError("")
    setAuthBusy(true)
    try {
      if (authMode === "signup") await signup(form.name, form.email, form.password)
      else await login(form.email, form.password)
      setForm({ name: "", email: "", password: "" })
      setView("hero")
    } catch (e) {
      setAuthError((e as Error).message)
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <section className="relative h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0">
        {videos.map((video, index) => (
          <video
            key={video.label}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
              activeVideo === index ? "opacity-100" : "opacity-0"
            }`}
            src={video.src}
            autoPlay
            muted
            loop
            playsInline
            preload={index === 0 ? "auto" : "metadata"}
            aria-hidden="true"
          />
        ))}
      </div>

      <img
        className="train-bob pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover"
        src="https://soft-zoom-63098134.figma.site/_assets/v11/0b4a435b2df2747593c43d7a1c9b4578f7d8d90c.png"
        alt=""
        aria-hidden="true"
      />

      <div className="relative z-[2] flex h-full flex-col px-5 py-5 sm:px-8 sm:py-6 lg:px-12 lg:py-8">
        <header className="relative z-[60] flex shrink-0 items-center justify-between">
          <a
            href="#"
            className="text-xl italic tracking-tight text-white sm:text-2xl"
            aria-label="Lumora home"
          >
            Try-On AI
          </a>

          <nav
            className="liquid-glass hidden items-center gap-1 rounded-full p-1.5 pl-5 md:flex"
            aria-label="Primary navigation"
          >
            {navLinks.map((link) => (
              <button
                key={link}
                onClick={() => { setAuthMode("login"); setView("login") }}
                className="cursor-pointer px-3 py-2 text-sm text-white/90 transition-colors hover:text-white"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                {link}
              </button>
            ))}
            <button
              onClick={handleTryOn}
              className="ml-1 cursor-pointer rounded-full bg-white px-5 py-2.5 text-sm font-medium text-slate-900 transition-transform hover:scale-[1.02]"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              Get the Try-On result
            </button>
          </nav>

          <button
            type="button"
            className="liquid-glass relative flex size-11 items-center justify-center rounded-full text-white md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={
              menuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={menuOpen}
          >
            <Menu
              className={`absolute size-5 transition-all duration-300 ${
                menuOpen
                  ? "rotate-90 scale-75 opacity-0"
                  : "rotate-0 scale-100 opacity-100"
              }`}
            />
            <X
              className={`absolute size-5 transition-all duration-300 ${
                menuOpen
                  ? "rotate-0 scale-100 opacity-100"
                  : "-rotate-90 scale-75 opacity-0"
              }`}
            />
          </button>
        </header>

        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:hidden ${
            menuOpen
              ? "visible opacity-100"
              : "invisible pointer-events-none opacity-0"
          }`}
          aria-hidden={!menuOpen}
        >
          <nav
            className="flex w-full flex-col items-center gap-7"
            aria-label="Mobile navigation"
          >
            {navLinks.map((link, index) => (
              <button
                key={link}
                className={`text-3xl text-white transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                  menuOpen
                    ? "translate-y-0 opacity-100"
                    : "translate-y-4 opacity-0"
                }`}
                style={{
                  transitionDelay: menuOpen ? `${100 + index * 50}ms` : "0ms",
                }}
                onClick={() => {
                  setAuthMode("login")
                  setView("login")
                  setMenuOpen(false)
                }}
                tabIndex={menuOpen ? 0 : -1}
              >
                {link}
              </button>
            ))}
            <button
              className={`mt-3 rounded-full bg-white px-8 py-3.5 text-sm font-medium text-slate-900 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                menuOpen ? "scale-100 opacity-100" : "scale-75 opacity-0"
              }`}
              style={{
                fontFamily: "system-ui, sans-serif",
                transitionDelay: menuOpen ? "300ms" : "0ms",
              }}
              onClick={handleTryOn}
              tabIndex={menuOpen ? 0 : -1}
            >
              Get the Try -On results
            </button>
          </nav>
        </div>

        <main
          className={`flex min-h-0 flex-1 flex-col items-center justify-center text-center transition-colors duration-700 ${
            isDark ? "text-[#182C41]" : "text-white"
          }`}
        >
          {view === "hero" ? (
            <div className="flex w-full flex-col items-center gap-3 sm:gap-4 lg:gap-5">
              <div
                className="liquid-glass rounded-full px-4 py-2 text-[10px] sm:px-5 sm:text-xs"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                Try it on before you buy it.
              </div>

              <h1 className="max-w-4xl text-4xl leading-[1.02] tracking-[-0.035em] sm:text-5xl md:text-7xl lg:text-[5.5rem] lg:leading-[1.1]">
                “Your Style. Your Photo. Your Fit.”
              </h1>

              <p
                className="max-w-xl px-2 text-xs leading-relaxed sm:text-sm md:text-base"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                Upload your photo, choose your favourite outfit, and see
                yourself wearing it with AI.
              </p>

              <form
                className="liquid-glass grid w-full max-w-[320px] grid-cols-1 gap-2 rounded-3xl p-2 sm:max-w-lg sm:grid-cols-2"
                onSubmit={(event) => event.preventDefault()}
              >
                <input
                  id="person-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    setPersonFile(e.target.files?.[0] ?? null)
                    setTryOnError("")
                  }}
                  className="sr-only"
                />
                <label
                  htmlFor="person-photo"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-xs font-medium text-slate-900 transition-transform hover:scale-[1.02] sm:text-sm"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  <span className="max-w-[10rem] truncate">
                    {personFile ? personFile.name : "Upload Photo"}
                  </span>
                </label>
                <input
                  id="clothes-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    setGarmentFile(e.target.files?.[0] ?? null)
                    setTryOnError("")
                  }}
                  className="sr-only"
                />
                <label
                  htmlFor="clothes-photo"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-xs font-medium text-slate-900 transition-transform hover:scale-[1.02] sm:text-sm"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  <span className="max-w-[10rem] truncate">
                    {garmentFile ? garmentFile.name : "Upload Clothes Photo"}
                  </span>
                </label>
              </form>
              {tryOnError && (
                <p
                  className="text-xs text-red-300 sm:text-sm"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                  role="alert"
                >
                  {tryOnError}
                </p>
              )}
            </div>
          ) : view === "results" ? (
            <div className="flex w-full flex-col items-center justify-center px-4">
              <div className="liquid-glass flex aspect-video w-full max-w-4xl flex-col items-center justify-center rounded-[2rem] p-8 shadow-2xl md:rounded-[3rem]">
                <div className="flex h-full w-full flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/20 bg-white/5 md:rounded-[2rem]">
                  {resultUrl ? (
                    <img
                      src={resultUrl}
                      alt="Your try-on result"
                      className="max-h-[50vh] rounded-2xl object-contain"
                    />
                  ) : (
                    <>
                      <Upload className="mb-4 size-10 text-white/50" />
                      <h2 className="mb-2 text-2xl font-medium tracking-tight text-white md:text-4xl">
                        AI Clothes Changer
                      </h2>
                    </>
                  )}
                  {status === "loading" && (
                    <p
                      className="text-sm text-white/70"
                      style={{ fontFamily: "system-ui, sans-serif" }}
                    >
                      Processing your try-on results...
                    </p>
                  )}
                  {status === "error" && (
                    <p
                      className="px-4 text-sm text-red-300"
                      style={{ fontFamily: "system-ui, sans-serif" }}
                      role="alert"
                    >
                      {tryOnError}
                    </p>
                  )}
                  <button
                    onClick={() => setView("hero")}
                    className="mt-6 rounded-full bg-white/10 px-6 py-2 text-sm text-white transition-colors hover:bg-white/20"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center justify-center px-4 animate-in fade-in duration-500">
              <div className="liquid-glass flex w-full max-w-md flex-col items-center justify-center rounded-[2rem] p-8 shadow-2xl md:p-10">
                <h2 className="mb-6 text-2xl font-medium tracking-tight text-white md:text-3xl">
                  {authMode === "signup" ? "Create Account" : "Log In"}
                </h2>
                <form
                  className="flex w-full flex-col gap-4"
                  onSubmit={handleAuth}
                >
                  {authMode === "signup" && (
                  <input
                    type="text"
                    placeholder="Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-full bg-white/10 px-5 py-3 text-sm text-white outline-none placeholder:text-white/60 focus:bg-white/20"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  />
                  )}
                  <input
                    type="email"
                    required
                    placeholder="E-mail"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-full bg-white/10 px-5 py-3 text-sm text-white outline-none placeholder:text-white/60 focus:bg-white/20"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="Password (min 8 characters)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-full bg-white/10 px-5 py-3 text-sm text-white outline-none placeholder:text-white/60 focus:bg-white/20"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  />
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="mt-2 w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-900 transition-transform hover:scale-[1.02]"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >
                    {authBusy ? "Please wait..." : authMode === "signup" ? "Sign Up" : "Log In"}
                  </button>
                  {authError && (
                    <p
                      className="text-xs text-red-300"
                      style={{ fontFamily: "system-ui, sans-serif" }}
                      role="alert"
                    >
                      {authError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === "signup" ? "login" : "signup")
                      setAuthError("")
                    }}
                    className="text-xs text-white/70 hover:text-white underline-offset-4 hover:underline"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >
                    {authMode === "signup"
                      ? "Already have an account? Log in"
                      : "New here? Create an account"}
                  </button>
                </form>

                <div className="my-6 flex w-full items-center gap-4">
                  <div className="h-px flex-1 bg-white/20"></div>
                  <span
                    className="text-xs text-white/50"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >
                    OR
                  </span>
                  <div className="h-px flex-1 bg-white/20"></div>
                </div>

                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-white/10 px-5 py-3 text-sm text-white transition-colors hover:bg-white/20"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  <svg className="size-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Create account with Google
                </button>

                <button
                  onClick={() => setView("hero")}
                  className="mt-6 text-xs text-white/70 hover:text-white underline-offset-4 hover:underline"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  Back to Home
                </button>
              </div>
            </div>
          )}
        </main>

        <footer
          className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] text-white/70 sm:gap-x-3 sm:text-sm"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          {stats.map((stat, index) => (
            <div key={stat} className="contents">
              {index > 0 && <span className="hidden sm:inline">|</span>}
              <span>{stat}</span>
            </div>
          ))}
        </footer>
      </div>
    </section>
  )
}
