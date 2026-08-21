import { safeStorage } from 'electron'
import Store from 'electron-store'

const store = new Store()

export const SecureStorage = {
  save(key: string, value: string): boolean {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value)
      store.set(key, encrypted.toString('base64'))
      return true
    }
    return false
  },

  get(key: string): string | null {
    if (safeStorage.isEncryptionAvailable() && store.has(key)) {
      const encrypted = store.get(key) as string
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch (e) {
        console.error('Failed to decrypt key:', key, e)
        return null // Return null on failure
      }
    }
    return null
  },

  clear(key: string) {
    store.delete(key)
  }
}
