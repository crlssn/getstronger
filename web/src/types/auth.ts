import type { JwtPayload } from 'jwt-decode'

export interface AccessToken extends JwtPayload {
  userId: string
}
