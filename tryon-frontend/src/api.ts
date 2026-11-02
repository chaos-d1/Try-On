const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000"

export const getToken = () => localStorage.getItem("token")
export const logout = () => localStorage.removeItem("token")

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${API}${path}`, { ...init, headers })
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?")
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) logout()
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export async function signup(name: string, email: string, password: string) {
  const d = await request("/api/auth/signup", json({ name, email, password }))
  localStorage.setItem("token", d.token)
  return d.user
}

export async function login(email: string, password: string) {
  const d = await request("/api/auth/login", json({ email, password }))
  localStorage.setItem("token", d.token)
  return d.user
}

// Uploads both photos, then polls every 2s until the job finishes.
export async function runTryOn(person: File, garment: File): Promise<string> {
  const form = new FormData()
  form.append("person", person)
  form.append("garment", garment)

  let job = await request("/api/tryons", { method: "POST", body: form })
  while (job.status === "pending" || job.status === "processing") {
    await new Promise((r) => setTimeout(r, 2000))
    job = await request(`/api/tryons/${job.id}`)
  }
  if (job.status === "failed") throw new Error(job.error || "Try-on failed")
  return job.result_image_url
}
