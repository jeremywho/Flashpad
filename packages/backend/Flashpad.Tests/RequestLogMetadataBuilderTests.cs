using Backend.Observability;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;

namespace Backend.Tests;

public class RequestLogMetadataBuilderTests
{
    [Fact]
    public void Build_RedactsQueryValuesWhileKeepingSafeSummaryFields()
    {
        var context = new DefaultHttpContext();
        context.Request.Method = "GET";
        context.Request.Path = "/hubs/notes";
        context.Request.QueryString = new QueryString("?access_token=super-secret-token&transport=webSockets");
        context.User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "42")
        }));

        var metadata = RequestLogMetadataBuilder.Build(context, 125, 200, null);

        Assert.Equal("GET", metadata["method"]);
        Assert.Equal("/hubs/notes", metadata["path"]);
        Assert.Equal(200, metadata["statusCode"]);
        Assert.Equal(125L, metadata["durationMs"]);
        Assert.Equal("42", metadata["userId"]);
        Assert.Equal(2, metadata["queryParameterCount"]);
        Assert.Equal(true, metadata["hasSensitiveQueryParameters"]);
        Assert.Equal("hub", metadata["requestType"]);
        Assert.False(metadata.ContainsKey("query"));
        Assert.DoesNotContain("super-secret-token", metadata.Values.Select(value => value?.ToString() ?? string.Empty));
    }
}
