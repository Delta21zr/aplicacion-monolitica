package config

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client
var Ctx = context.Background()

func ConnectRedis() {
	RDB = redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	_, err := RDB.Ping(Ctx).Result()
	if err != nil {
		log.Fatal("Could not connect to Redis: ", err)
	}

	fmt.Println("Connected to Redis (Cart DB)!")
}
