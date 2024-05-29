import Product from "@/lib/models/product.model"
import { connectToDB } from "@/lib/mongoose"
import { generateEmailBody, sendEmail } from "@/lib/nodemailer"
import { scrapeAmazonProduct } from "@/lib/scraper"
import { getAveragePrice, getEmailNotifType, getHighestPrice, getLowestPrice } from "@/lib/utils"
import { NextResponse } from "next/server"

//execution modes
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const revalidate = 0

//Send periodically email when price updates
export async function GET(){
    try {
        connectToDB()

        const products = await Product.find({})

        if(!products) throw new Error("No products found")

        //Scrape latest product details and update DB
        const updatedProducts = await Promise.all(
            products.map(async (currentProduct) => {
                const scrapedProduct = await scrapeAmazonProduct(currentProduct.url)

                if(!scrapedProduct) return

                    const updatedPriceHistory = [
                        ...currentProduct.priceHistory,
                        {
                          price: scrapedProduct.currentPrice,
                        },
                      ];
              
                      const product = {
                        ...scrapedProduct,
                        priceHistory: updatedPriceHistory,
                        lowestPrice: getLowestPrice(updatedPriceHistory),
                        highestPrice: getHighestPrice(updatedPriceHistory),
                        averagePrice: getAveragePrice(updatedPriceHistory),
                      };
              
                      // Update Products in DB
                      const updatedProduct = await Product.findOneAndUpdate(
                        {
                          url: product.url,
                        },
                        product
                      );

                      // Check Each Product's status & send email accordingly
                      const emailNotifType = getEmailNotifType(scrapedProduct, currentProduct)

                      if(emailNotifType && updatedProduct.users.length > 0){
                        const productInfo = {
                            title : updatedProduct.url,
                            url : updatedProduct.title
                        }

                        const emailContent = await generateEmailBody(productInfo, emailNotifType)

                        //find all users who subscribes to current product and send email to all
                        const userEmails = updatedProduct.users.map((user:any) => user.email)

                        await sendEmail(emailContent, userEmails)
                      }

                      return updatedProduct

            })
        )

        return NextResponse.json({
            message : 'OK', data : updatedProducts
        })
    } catch (error) {
        throw new Error(`Error in GET : ${error}`)
    }
}