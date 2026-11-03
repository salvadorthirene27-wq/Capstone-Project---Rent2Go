import { auth } from "./lib/auth";
export default auth.middleware({ loginUrl: "/login" });
export const config = { matcher: ["/workspace/:path*", "/admin/:path*"] };
