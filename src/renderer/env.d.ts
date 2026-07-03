/// <reference types="vite/client" />
import type { EmberApi } from '../preload/index'

declare global {
  interface Window {
    ember: EmberApi
  }
}
