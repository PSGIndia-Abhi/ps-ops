export { httpClient, ApiError, setUnauthorizedHandler } from './httpClient';
import * as authApi from './auth';

// The client app only needs sign-in / profile calls here; everything else is in client/api.ts.
export { authApi };
