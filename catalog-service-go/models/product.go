package models

import "go.mongodb.org/mongo-driver/bson/primitive"

type Product struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	Name           string             `bson:"name" json:"name"`
	Description    string             `bson:"description" json:"description"`
	Category       string             `bson:"category" json:"category"`
	Subcategory    string             `bson:"subcategory,omitempty" json:"subcategory,omitempty"`
	Brand          string             `bson:"brand" json:"brand"`
	Price          float64            `bson:"price" json:"price"`
	Images         []string           `bson:"images" json:"images"`
	Tags           []string           `bson:"tags,omitempty" json:"tags,omitempty"`
	Specifications map[string]string  `bson:"specifications,omitempty" json:"specifications,omitempty"`
	InStock        bool               `bson:"in_stock" json:"in_stock"`
}
