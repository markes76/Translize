import type { TranslizeAPI } from '../../../preload/index'

declare global {
  interface Window {
    translize: TranslizeAPI
  }
}

export {}
