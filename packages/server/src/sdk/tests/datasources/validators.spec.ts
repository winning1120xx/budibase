import { SourceName } from "@budibase/types"
import integrations from "../../../integrations"
import { GenericContainer } from "testcontainers"
import { env } from "@budibase/backend-core"

jest.unmock("pg")
jest.unmock("mysql2/promise")

describe("datasource validators", () => {
  describe("postgres", () => {
    const validator = integrations.getValidator[SourceName.POSTGRES]!

    let host: string
    let port: number

    beforeAll(async () => {
      const container = await new GenericContainer("postgres")
        .withExposedPorts(5432)
        .withEnv("POSTGRES_PASSWORD", "password")
        .start()

      host = container.getContainerIpAddress()
      port = container.getMappedPort(5432)
    })

    it("test valid connection string", async () => {
      const result = await validator({
        host,
        port,
        database: "postgres",
        user: "postgres",
        password: "password",
        schema: "public",
        ssl: false,
        rejectUnauthorized: false,
      })
      expect(result).toBe(true)
    })

    it("test invalid connection string", async () => {
      const result = await validator({
        host,
        port,
        database: "postgres",
        user: "wrong",
        password: "password",
        schema: "public",
        ssl: false,
        rejectUnauthorized: false,
      })
      expect(result).toEqual({
        error: 'password authentication failed for user "wrong"',
      })
    })
  })

  describe("mysql", () => {
    const validator = integrations.getValidator[SourceName.MYSQL]!

    let host: string
    let port: number

    beforeAll(async () => {
      const container = await new GenericContainer("mysql")
        .withExposedPorts(3306)
        .withEnv("MYSQL_ROOT_PASSWORD", "admin")
        .withEnv("MYSQL_DATABASE", "db")
        .withEnv("MYSQL_USER", "user")
        .withEnv("MYSQL_PASSWORD", "password")
        .start()

      host = container.getContainerIpAddress()
      port = container.getMappedPort(3306)
    })

    it("test valid connection string", async () => {
      const result = await validator({
        host,
        port,
        user: "user",
        database: "db",
        password: "password",
        rejectUnauthorized: true,
      })
      expect(result).toBe(true)
    })

    it("test invalid database", async () => {
      const result = await validator({
        host,
        port,
        user: "user",
        database: "test",
        password: "password",
        rejectUnauthorized: true,
      })
      expect(result).toEqual({
        error: "Access denied for user 'user'@'%' to database 'test'",
      })
    })

    it("test invalid password", async () => {
      const result = await validator({
        host,
        port,
        user: "root",
        database: "test",
        password: "wrong",
        rejectUnauthorized: true,
      })
      expect(result).toEqual({
        error:
          "Access denied for user 'root'@'172.17.0.1' (using password: YES)",
      })
    })
  })

  describe("couchdb", () => {
    const validator = integrations.getValidator[SourceName.COUCHDB]!

    it("test valid connection string", async () => {
      const result = await validator({
        url: env.COUCH_DB_URL,
        database: "",
      })
      expect(result).toBe(true)
    })

    it("test invalid database", async () => {
      const result = await validator({
        url: env.COUCH_DB_URL,
        database: "db",
      })
      expect(result).toBe(false)
    })

    it("test invalid url", async () => {
      const result = await validator({
        url: "http://invalid:123",
        database: "any",
      })
      expect(result).toEqual({
        error:
          "request to http://invalid:123/any failed, reason: getaddrinfo ENOTFOUND invalid",
      })
    })
  })
})
