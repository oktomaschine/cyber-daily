import { gql, GraphQLClient } from 'graphql-request'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { optimism } from 'viem/chains'
import { SiweMessage } from 'siwe'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { readLines } from './utils'

import nodeFetch from 'node-fetch'

import type { RequestInit } from 'node-fetch'
import type { Address } from 'viem'

const CYBER_API_ENDPOINT = 'https://api.cyberconnect.dev/l2/'

const accounts = await readLines('./accounts.txt')
const proxies = await readLines('./proxies.txt')

if (proxies.length > 0 && accounts.length > proxies.length)
  throw new Error('Accounts count should match proxies count')

console.log('Processing...')

accounts.forEach(async (PK, i) => {
  const proxy = proxies.length > 0 && new HttpsProxyAgent(proxies[i])
  const proxyFetch =
    (url: URL | string, init?: RequestInit) =>
      nodeFetch(url, { ...init, agent: proxy })

  const client = new GraphQLClient(CYBER_API_ENDPOINT, { fetch: proxyFetch as unknown as typeof fetch })
  const account = privateKeyToAccount(PK as Address)

  interface INonce {
    nonce: {
      status: string
      message: string
      data: string
    }
  }

  const { nonce } = await client.request<INonce>(
    gql`
    mutation getNonce($input: NonceInput!) {
      nonce(input: $input) {
        status
        message
        data
      }
    }
  `,
    {
      input: {
        address: account.address
      }
    }
  )

  const message = new SiweMessage({
    domain: 'cyber.co',
    address: account.address,
    statement: 'Sign in Cyber',
    uri: 'https://cyber.co',
    version: '1',
    chainId: optimism.id,
    nonce: nonce.data,
  })

  const walletClient = createWalletClient({
    account,
    chain: optimism,
    transport: http()
  })

  const signature = await walletClient.signMessage({
    message: message.prepareMessage(),
  })

  interface ILogin {
    login: {
      status: string
      message: string
      data: {
        accessToken: string
        address: string
      }
    }
  }

  const { login } = await client.request<ILogin>(
    gql`
    mutation login($input: LoginInput!) {
      login(input: $input) {
        status
        message
        data {
          accessToken
          address
        }
      }
    }
  `,
    {
      input: {
        address: account.address,
        chainId: optimism.id,
        signature: signature,
        signedMessage: message.prepareMessage()
      }
    }
  )

  client.setHeader('authorization', login.data.accessToken)

  interface ICheckIn {
    checkIn: {
      status: "SUCCESS" | "ALREADY_CHECKED_IN"
    }
  }

  const { checkIn } = await client.request<ICheckIn>(
    gql`
    mutation checkedIn {
      checkIn {
        status
      }
    }
  `
  )

  console.log(`${account.address}: ${checkIn.status}`)
})