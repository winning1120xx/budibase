import { GenericContainer } from "testcontainers"
import { generator } from "@budibase/backend-core/tests"
import postgres from "../../../integrations/postgres"
import mysql from "../../../integrations/mysql"
import couchdb from "../../../integrations/couchdb"

jest.unmock("pg")
jest.unmock("mysql2/promise")

describe("datasource validators", () => {
  describe("postgres", () => {
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
      const integration = new postgres.integration({
        host,
        port,
        database: "postgres",
        user: "postgres",
        password: "password",
        schema: "public",
        ssl: false,
        rejectUnauthorized: false,
      })
      const result = await integration.testConnection()
      expect(result).toBe(true)
    })

    it("test invalid connection string", async () => {
      const integration = new postgres.integration({
        host,
        port,
        database: "postgres",
        user: "wrong",
        password: "password",
        schema: "public",
        ssl: false,
        rejectUnauthorized: false,
      })
      const result = await integration.testConnection()
      expect(result).toEqual({
        error: 'password authentication failed for user "wrong"',
      })
    })
  })

  describe("mysql", () => {
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
      const integration = new mysql.integration({
        host,
        port,
        user: "user",
        database: "db",
        password: "password",
        rejectUnauthorized: true,
      })
      const result = await integration.testConnection()
      expect(result).toBe(true)
    })

    it("test invalid database", async () => {
      const integration = new mysql.integration({
        host,
        port,
        user: "user",
        database: "test",
        password: "password",
        rejectUnauthorized: true,
      })
      const result = await integration.testConnection()
      expect(result).toEqual({
        error: "Access denied for user 'user'@'%' to database 'test'",
      })
    })

    it("test invalid password", async () => {
      const integration = new mysql.integration({
        host,
        port,
        user: "root",
        database: "test",
        password: "wrong",
        rejectUnauthorized: true,
      })
      const result = await integration.testConnection()
      expect(result).toEqual({
        error:
          "Access denied for user 'root'@'172.17.0.1' (using password: YES)",
      })
    })
  })

  describe("couchdb", () => {
    let url: string

    beforeAll(async () => {
      const user = generator.first()
      const password = generator.hash()

      const container = await new GenericContainer("budibase/couchdb")
        .withExposedPorts(5984)
        .withEnv("COUCHDB_USER", user)
        .withEnv("COUCHDB_PASSWORD", password)
        .start()

      const host = container.getContainerIpAddress()
      const port = container.getMappedPort(5984)

      await container.exec([
        `curl`,
        `-u`,
        `${user}:${password}`,
        `-X`,
        `PUT`,
        `localhost:5984/db`,
      ])
      url = `http://${user}:${password}@${host}:${port}`
    })

    it("test valid connection string", async () => {
      const integration = new couchdb.integration({
        url,
        database: "db",
      })
      const result = await integration.testConnection()
      expect(result).toBe(true)
    })

    it("test invalid database", async () => {
      const integration = new couchdb.integration({
        url,
        database: "random_db",
      })
      const result = await integration.testConnection()
      expect(result).toBe(false)
    })

    it("test invalid url", async () => {
      const integration = new couchdb.integration({
        url: "http://invalid:123",
        database: "any",
      })
      const result = await integration.testConnection()
      expect(result).toEqual({
        error:
          "request to http://invalid:123/any failed, reason: getaddrinfo ENOTFOUND invalid",
      })
    })
  })
})
