import { IsNotEmpty, IsOptional, IsString, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

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
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    
    // Check if it's a valid base64 pattern
    if (!base64Regex.test(str)) {
      return false;
    }
    
    try {
      // Additional validation by trying to decode
      const decoded = Buffer.from(str, 'base64').toString('base64');
      return decoded === str;
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
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  @Validate(IsBase64StringConstraint)
  imageData?: string;  // Base64 encoded image

  @IsString()
  @IsOptional()
  prompt?: string;  // Optional prompt to guide the analysis
  
  // Class-level validation to ensure exactly one of imageUrl or imageData is provided
  @Validate(IsExactlyOneOfConstraint, ['imageUrl', 'imageData'])
  oneImageSource: any;
}
