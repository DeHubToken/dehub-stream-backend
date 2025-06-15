import { IsOptional, IsString, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface, MaxLength, MinLength, IsUrl, IsNotEmpty, IsMongoId } from 'class-validator';

// Custom validator to ensure exactly one of the fields is provided
@ValidatorConstraint({ name: 'isExactlyOneOf', async: false })
export class IsExactlyOneOfConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const object = args.object as any;
    const properties = args.constraints as string[];
    
    let providedCount = 0;
    for (const property of properties) {
      if (object[property] !== undefined && object[property] !== null && object[property] !== '') {
        providedCount++;
      }
    }
    
    return providedCount === 1;
  }
  
  defaultMessage(args: ValidationArguments) {
    return `Exactly one of ${args.constraints.join(', ')} must be provided`;
  }
}

// Custom validator for Base64 validation
@ValidatorConstraint({ name: 'isBase64String', async: false })
export class IsBase64StringConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    if (!value) return true; // Skip validation if value is not provided
    
    try {
      // Check if it's already a data URI
      if (value.startsWith('data:')) {
        // Extract the base64 part from data URI
        const base64Part = value.split(',')[1];
        return this.isBase64(base64Part);
      }
      
      // Try to decode the string as base64
      return this.isBase64(value);
    } catch (e) {
      return false;
    }
  }
  
  private isBase64(str: string): boolean {
    // Regular expression to check if string is base64 encoded
    const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    
    // Check if it's a valid base64 pattern
    if (!base64Regex.test(str)) {
      return false;
    }
    
    // Buffer.from itself can throw an error if the string is not valid base64 or is too long
    // but the primary check is the regex and ensuring it re-encodes to the same value for padding validation
    try {
      return Buffer.from(str, 'base64').toString('base64') === str;
    } catch (e) {
      return false;
    }
  }
  
  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a valid base64 encoded string`;
  }
}

export class AnalyzeImageDto {
  @IsString()
  @IsNotEmpty({ message: 'Conversation ID is required' })
  @IsMongoId({ message: 'Conversation ID must be a valid MongoDB ID' })
  conversationId: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Valid image URL is required' })
  @MaxLength(2048, { message: 'Image URL is too long (maximum 2048 characters)' })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @Validate(IsBase64StringConstraint)
  imageData?: string;  // Base64 encoded image

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Prompt must be provided if provided' })
  @MaxLength(1000, { message: 'Prompt must be less than 1000 characters' })
  prompt?: string;  // Optional prompt to guide the analysis
  
  // Class-level validation to ensure exactly one of imageUrl or imageData is provided
  @Validate(IsExactlyOneOfConstraint, ['imageUrl', 'imageData'])
  oneImageSource: any;
}
