package email

import (
	"context"
	"fmt"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
	"github.com/davecgh/go-spew/spew"
)

func Send(ctx context.Context, to string) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion("eu-west-2"))
	if err != nil {
		log.Fatalf("failed to load AWS config: %v", err)
	}
	spew.Dump(cfg)

	// Create SES client
	sesClient := ses.NewFromConfig(cfg)

	// Email details
	sender := "noreply@getstronger.pro"
	subject := "Test Email from Amazon SES"
	body := "Hello! This is a test email sent using Amazon SES and Golang."

	// Build the email input
	input := &ses.SendEmailInput{
		Destination: &types.Destination{
			ToAddresses: []string{to},
		},
		Message: &types.Message{
			Body: &types.Body{
				Text: &types.Content{
					Data: aws.String(body),
				},
			},
			Subject: &types.Content{
				Data: aws.String(subject),
			},
		},
		Source: aws.String(sender),
	}

	spew.Dump(input)

	// Send the email
	output, err := sesClient.SendEmail(ctx, input)
	if err != nil {
		log.Fatalf("failed to send email: %v", err)
	}

	fmt.Printf("Email sent successfully! Message ID: %s\n", *output.MessageId)
}
