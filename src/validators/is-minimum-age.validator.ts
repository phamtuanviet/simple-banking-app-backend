import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsMinimumAge(
  minAge: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isMinimumAge',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [minAge], // Truyền số tuổi tối thiểu vào đây
      options: validationOptions,
      validator: {
        // Hàm này sẽ chạy mỗi khi validate
        validate(value: any, args: ValidationArguments) {
          if (!value) return false;

          const [minimumAge] = args.constraints;
          const dob = new Date(value);

          // Kiểm tra xem ngày nhập vào có hợp lệ không
          if (isNaN(dob.getTime())) return false;

          const today = new Date();

          // Chặn luôn ngày sinh ở tương lai (chưa sinh ra)
          if (dob > today) return false;

          // Tính toán số tuổi chính xác đến từng ngày
          let age = today.getFullYear() - dob.getFullYear();
          const monthDiff = today.getMonth() - dob.getMonth();

          // Nếu chưa tới tháng sinh, hoặc tới tháng rồi nhưng chưa tới ngày sinh thì trừ đi 1 tuổi
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < dob.getDate())
          ) {
            age--;
          }

          // Trả về true nếu đủ tuổi, false nếu chưa đủ
          return age >= minimumAge;
        },

        // Cấu hình câu thông báo lỗi
        defaultMessage(args: ValidationArguments) {
          const [minimumAge] = args.constraints;
          return `Ngày sinh không hợp lệ. Khách hàng phải đủ ${minimumAge} tuổi.`;
        },
      },
    });
  };
}
