FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY . .

RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /kebiao ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app

COPY --from=builder /kebiao .
COPY web/ ./web/

RUN mkdir -p /app/data

ENV PORT=8080
ENV JWT_SECRET="change-me-in-production"
ENV DATA_DIR="/app/data"

EXPOSE 8080

CMD ["./kebiao"]
