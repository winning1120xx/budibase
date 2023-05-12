import { GenericContainer, Wait } from "testcontainers"
import { generator } from "@budibase/backend-core/tests"
import { Duration, TemporalUnit } from "node-duration"
import { SourceName } from "@budibase/types"
import integrations from "../../../integrations"

import postgres from "../../../integrations/postgres"
import mysql from "../../../integrations/mysql"
import couchdb from "../../../integrations/couchdb"
import mssql from "../../../integrations/microsoftSqlServer"
import mongo from "../../../integrations/mongodb"

jest.unmock("pg")
jest.unmock("mysql2/promise")
jest.unmock("mssql")
jest.unmock("mongodb")
jest.unmock("arangojs")

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

  describe("mssql", () => {
    let host: string, port: number

    const password = "Str0Ng_p@ssW0rd!"

    beforeAll(async () => {
      const container = await new GenericContainer(
        "mcr.microsoft.com/mssql/server"
      )
        .withExposedPorts(1433)
        .withEnv("ACCEPT_EULA", "Y")
        .withEnv("MSSQL_SA_PASSWORD", password)
        .withEnv("MSSQL_PID", "Developer")
        .withWaitStrategy(Wait.forHealthCheck())
        .withHealthCheck({
          test: `/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "${password}" -Q "SELECT 1" -b -o /dev/null`,
          interval: new Duration(1000, TemporalUnit.MILLISECONDS),
          timeout: new Duration(3, TemporalUnit.SECONDS),
          retries: 20,
          startPeriod: new Duration(100, TemporalUnit.MILLISECONDS),
        })
        .start()

      host = container.getContainerIpAddress()
      port = container.getMappedPort(1433)
    })

    it("test valid connection string", async () => {
      const integration = new mssql.integration({
        user: "sa",
        password,
        server: host,
        port: port,
        database: "master",
        schema: "dbo",
      })
      const result = await integration.testConnection()
      expect(result).toBe(true)
    })

    it("test invalid password", async () => {
      const integration = new mssql.integration({
        user: "sa",
        password: "wrong_pwd",
        server: host,
        port: port,
        database: "master",
        schema: "dbo",
      })
      const result = await integration.testConnection()
      expect(result).toEqual({
        error: "ConnectionError: Login failed for user 'sa'.",
      })
    })
  })

  describe("mongo", () => {
    let connectionSettings: {
      user: string
      password: string
      host: string
      port: number
    }

    function getConnectionString(
      settings: Partial<typeof connectionSettings> = {}
    ) {
      const { user, password, host, port } = {
        ...connectionSettings,
        ...settings,
      }
      return `mongodb://${user}:${password}@${host}:${port}`
    }

    beforeAll(async () => {
      const user = generator.name()
      const password = generator.hash()
      const container = await new GenericContainer("mongo")
        .withExposedPorts(27017)
        .withEnv("MONGO_INITDB_ROOT_USERNAME", user)
        .withEnv("MONGO_INITDB_ROOT_PASSWORD", password)
        .start()

      connectionSettings = {
        user,
        password,
        host: container.getContainerIpAddress(),
        port: container.getMappedPort(27017),
      }
    })

    it("test valid connection string", async () => {
      const integration = new mongo.integration({
        connectionString: getConnectionString(),
        db: "",
        tlsCertificateFile: "",
        tlsCertificateKeyFile: "",
        tlsCAFile: "",
      })
      const result = await integration.testConnection()
      expect(result).toBe(true)
    })

    it("test invalid password", async () => {
      const integration = new mongo.integration({
        connectionString: getConnectionString({ password: "wrong" }),
        db: "",
        tlsCertificateFile: "",
        tlsCertificateKeyFile: "",
        tlsCAFile: "",
      })
      const result = await integration.testConnection()
      expect(result).toEqual({ error: "Authentication failed." })
    })

    it("test invalid username", async () => {
      const integration = new mongo.integration({
        connectionString: getConnectionString({ user: "wrong" }),
        db: "",
        tlsCertificateFile: "",
        tlsCertificateKeyFile: "",
        tlsCAFile: "",
      })
      const result = await integration.testConnection()
      expect(result).toEqual({ error: "Authentication failed." })
    })

    it("test invalid connection", async () => {
      const integration = new mongo.integration({
        connectionString: getConnectionString({ host: "http://nothinghere" }),
        db: "",
        tlsCertificateFile: "",
        tlsCertificateKeyFile: "",
        tlsCAFile: "",
      })
      const result = await integration.testConnection()
      expect(result).toEqual({ error: "Error: getaddrinfo ENOTFOUND http" })
    })
  })

  describe("arangodb", () => {
    const validator = integrations.getValidator[SourceName.ARANGODB]

    let connectionSettings: {
      user: string
      password: string
      url: string
    }

    beforeAll(async () => {
      const user = "root"
      const password = generator.hash()
      const container = await new GenericContainer("arangodb")
        .withExposedPorts(8529)
        .withEnv("ARANGO_ROOT_PASSWORD", password)
        .withWaitStrategy(
          Wait.forLogMessage("is ready for business. Have fun!")
        )
        .start()

      connectionSettings = {
        user,
        password,
        url: `http://${container.getContainerIpAddress()}:${container.getMappedPort(
          8529
        )}`,
      }
    })

    it("test valid connection string", async () => {
      const result = await validator({
        url: connectionSettings.url,
        username: connectionSettings.user,
        password: connectionSettings.password,
        databaseName: "",
        collection: "",
      })
      expect(result).toBe(true)
    })

    it("test wrong password", async () => {
      const result = await validator({
        url: connectionSettings.url,
        username: connectionSettings.user,
        password: "wrong",
        databaseName: "",
        collection: "",
      })
      expect(result).toEqual({
        error: "not authorized to execute this request",
      })
    })

    it("test wrong url", async () => {
      const result = await validator({
        url: "http://not.here",
        username: connectionSettings.user,
        password: connectionSettings.password,
        databaseName: "",
        collection: "",
      })
      expect(result).toEqual({
        error: "getaddrinfo ENOTFOUND not.here",
      })
    })
  })
})
