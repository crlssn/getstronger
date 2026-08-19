# Built by the deploy workflow and pushed to rg.fr-par.scw.cloud/getstronger/server.
FROM golang:1.26.6-alpine3.23 AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY server ./server
RUN CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/getstronger \
    ./server/cmd

FROM alpine:3.23.5

RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 getstronger \
    && adduser -S -D -H -u 10001 -G getstronger getstronger

WORKDIR /app

COPY --from=build /out/getstronger /app/getstronger

USER getstronger

EXPOSE 8080

ENTRYPOINT ["/app/getstronger"]
