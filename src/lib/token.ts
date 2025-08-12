import consola from "consola"
import fs from "node:fs/promises"

import { PATHS } from "~/lib/paths"
import { getCopilotToken } from "~/services/github/get-copilot-token"
import { getDeviceCode } from "~/services/github/get-device-code"
import { getGitHubUser } from "~/services/github/get-user"
import { pollAccessToken } from "~/services/github/poll-access-token"

import { HTTPError } from "./error"
import { state } from "./state"

let refreshTimeoutId: NodeJS.Timeout | null = null

const readGithubToken = () => fs.readFile(PATHS.GITHUB_TOKEN_PATH, "utf8")

const writeGithubToken = (token: string) =>
  fs.writeFile(PATHS.GITHUB_TOKEN_PATH, token)

const scheduleTokenRefresh = (delaySeconds: number) => {
  if (refreshTimeoutId) {
    clearTimeout(refreshTimeoutId)
  }

  refreshTimeoutId = setTimeout(async () => {
    consola.debug("Refreshing Copilot token")
    try {
      const { token, refresh_in } = await getCopilotToken()
      state.copilotToken = token
      consola.debug("Copilot token refreshed")
      if (state.showToken) {
        consola.info("Refreshed Copilot token:", token)
      }

      // Schedule next refresh using the new refresh_in value
      const nextRefreshInterval = refresh_in - 60
      scheduleTokenRefresh(nextRefreshInterval)
    } catch (error) {
      if ((error as any)?.cause?.code === "ENOTFOUND") {
        consola.warn(
          "Network unavailable while refreshing Copilot token; retrying in 60 seconds",
        )
        // Retry in 60 seconds when network is unavailable
        scheduleTokenRefresh(60)
        return
      }
      consola.error("Failed to refresh Copilot token:", error)
      // For other errors, retry with original interval (fallback)
      scheduleTokenRefresh(60)
    }
  }, delaySeconds * 1000)
}

export const setupCopilotToken = async () => {
  const { token, refresh_in } = await getCopilotToken()
  state.copilotToken = token

  // Display the Copilot token to the screen
  consola.debug("GitHub Copilot Token fetched successfully!")
  if (state.showToken) {
    consola.info("Copilot token:", token)
  }

  // Schedule the first refresh using the received refresh_in value
  const refreshInterval = refresh_in - 60
  scheduleTokenRefresh(refreshInterval)
}

interface SetupGitHubTokenOptions {
  force?: boolean
}

export async function setupGitHubToken(
  options?: SetupGitHubTokenOptions,
): Promise<void> {
  try {
    const githubToken = await readGithubToken()

    if (githubToken && !options?.force) {
      state.githubToken = githubToken
      if (state.showToken) {
        consola.info("GitHub token:", githubToken)
      }
      await logUser()

      return
    }

    consola.info("Not logged in, getting new access token")
    const response = await getDeviceCode()
    consola.debug("Device code response:", response)

    consola.info(
      `Please enter the code "${response.user_code}" in ${response.verification_uri}`,
    )

    const token = await pollAccessToken(response)
    await writeGithubToken(token)
    state.githubToken = token

    if (state.showToken) {
      consola.info("GitHub token:", token)
    }
    await logUser()
  } catch (error) {
    if (error instanceof HTTPError) {
      consola.error("Failed to get GitHub token:", await error.response.json())
      throw error
    }

    consola.error("Failed to get GitHub token:", error)
    throw error
  }
}

async function logUser() {
  const user = await getGitHubUser()
  consola.info(`Logged in as ${user.login}`)
}
