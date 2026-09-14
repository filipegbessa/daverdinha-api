export function createCorsOriginHandler(frontendUrlEnv: string | undefined) {
  const allowedOrigins = (frontendUrlEnv ?? 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim());

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  };
}
