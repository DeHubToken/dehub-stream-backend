## DeHub Streaming Backend

![NestJS](https://img.shields.io/badge/NestJS-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-green)
![Redis](https://img.shields.io/badge/Redis-purple)
![Docker](https://img.shields.io/badge/Docker-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Jest](https://img.shields.io/badge/Jest-red)

Streaming platform for NFTs.


## Installation

```bash
$ pnpm install
```

## Prerequisites

1. Define `.env` file
1. Start **MongoDB** locally
1. Start **Redis** locally
   - Run `docker-compose up -d` running in the project root

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

_Built with [Nest](https://github.com/nestjs/nest), a progressive Node.js framework for building efficient and scalable server-side applications._

## License

Nest is [MIT licensed](LICENSE).
