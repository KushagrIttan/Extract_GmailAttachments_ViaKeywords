var builder = DistributedApplication.CreateBuilder(args);

var postgresServer = builder.AddPostgres("postgres")
                            .WithPgAdmin()
                            .WithDataVolume("switchboard-data");
var switchboardDb = postgresServer.AddDatabase("switchboard");

var api = builder.AddProject<Projects.Switchboard_Api>("api")
                 .WithReference(switchboardDb)
                 .WithEnvironment("ConnectionStrings__chatModel", "http://localhost:11434")
                 .WaitFor(switchboardDb);

var evolutionApi = builder.AddContainer("evolution-api", "evoapicloud/evolution-api")
                          .WithImageTag("v2.1.1")
                          .WithEnvironment("AUTHENTICATION_TYPE", "apikey")
                          .WithEnvironment("AUTHENTICATION_API_KEY", "SwitchboardGlobalKey")
                          .WithEnvironment("DATABASE_PROVIDER", "postgresql")
                          .WithEnvironment("DATABASE_CONNECTION_URI", ReferenceExpression.Create($"postgresql://postgres:{postgresServer.Resource.PasswordParameter}@{postgresServer.GetEndpoint("tcp").Property(EndpointProperty.Host)}:{postgresServer.GetEndpoint("tcp").Property(EndpointProperty.Port)}/switchboard?schema=public"))
                          .WithEnvironment("WEBHOOK_GLOBAL_ENABLED", "true")
                          .WithEnvironment("WEBHOOK_GLOBAL_URL", ReferenceExpression.Create($"{api.GetEndpoint("http")}/api/webhooks/whatsapp"))
                          .WithEnvironment("WEBHOOK_GLOBAL_EVENTS", "MESSAGES_UPSERT")
                          .WithReference(switchboardDb)
                          .WaitFor(switchboardDb)
                          .WithHttpEndpoint(port: 8080, targetPort: 8080, name: "http");

api.WithReference(evolutionApi.GetEndpoint("http"))
   .WaitFor(evolutionApi);

var ui = builder.AddNpmApp("ui", "../Switchboard.UI", "dev")
                .WithReference(api)
                .WaitFor(api)
                .WithHttpEndpoint(env: "PORT", targetPort: 5173)
                .WithExternalHttpEndpoints();

builder.Build().Run();
