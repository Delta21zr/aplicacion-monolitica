package models

import "go.mongodb.org/mongo-driver/bson/primitive"

type Category struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	Name        string             `bson:"name" json:"name" binding:"required"`
	Slug        string             `bson:"slug" json:"slug" binding:"required"`
	Description string             `bson:"description,omitempty" json:"description,omitempty"`
	ParentID    string             `bson:"parent_id,omitempty" json:"parent_id,omitempty"`
}
