export function createRemoteMcpHandler(dependencies: {
  authenticate: (request: Request) => Promise<unknown>;
  handleApi: (request: Request, path: string) => Promise<Response>;
}): (request: Request) => Promise<Response>;
