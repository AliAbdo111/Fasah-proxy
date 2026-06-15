const cron = require('node-cron');
const FasahClient = require('./fasahClient');

class ScheduleCron {
  constructor() {
    this.client = FasahClient.getInstance();
    this.isRunning = false;
    this.job = null;
  }

  /**
   * جلب جدول المواعيد من FASAH
   */
  async fetchLandSchedule() {
    try {
      console.log(`[${new Date().toISOString()}] 🔄 جلب جدول المواعيد...`);
      
      // هنا ضع بياناتك الفعلية للاستعلام
      const params = {
        departure: 'AGF',        // كود المغادرة
        arrival: '31',          // كود المنطقة الوصول
        type: 'TRANSIT',        // نوع الموعد
        token: process.env.FASAH_TOKEN || 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ5bGR3YjAwMSIsIkdST1VQUyAiOiJBQSxHQSxST0xMT1VUVVNFUixUQVNBQ0NUQURNLFRBU0dFTixXQklCR1UsV0JJQlNHVSxXQklCVEdVLEJyb2tlciIsIkdST1VQUyI6IkFBLEdBLFJPTExPVVRVU0VSLFRBU0FDQ1RBRE0sVEFTR0VOLFdCSUJHVSxXQklCU0dVLFdCSUJUR1UsQnJva2VyIiwiSVNfU1NPICI6ZmFsc2UsIlNTT19UT0tFTiAiOiIiLCJJU19TU08iOmZhbHNlLCJTU09fVE9LRU4iOiIiLCJDTElFTlRfTkFNRSI6IkZBU0FIIiwiaXNzIjoiRkFTQUgiLCJhdWQiOiJGQVNBSCBBcHBsaWNhdGlvbiIsImV4cCI6MTc2NTY1MTgxMX0.vDAp8tCtnSBoEnCLPggVdkhSdcc7FlEPiDtat8YrmpVIqgj2UBT0rnnE_HU-YaFJCOF5lka1tz2zfzDtt_MMzg',
        userType: 'broker'
      };

      const result = await this.client.getLandSchedule(params);
      const scheduleData = {
        scheduleData: result
      };

      const schedule = require('../routes/models/Schedule');
      const newSchedule = new schedule(scheduleData);
      await newSchedule.save();
      // معالجة النتيجة
      if (result?.success !== false) {
        console.log(`[${new Date().toISOString()}] ✅ تم جلب ${result?.data?.length || 0} موعد`);
        
        // هنا يمكنك حفظ النتائج في قاعدة البيانات أو إرسال إشعار
        await this.saveScheduleToDB(result);
        
      } else {
        console.log(`[${new Date().toISOString()}] ⚠️  لا توجد مواعيد متاحة`, result.errors);
      }
      
      return result;
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ خطأ في جلب الجدول:`, error.message);
      return null;
    }
  }

  /**
   * حفظ المواعيد في قاعدة البيانات
   */
  async saveScheduleToDB(scheduleData) {
    try {
      // هنا يمكنك الاتصال بقاعدة البيانات الخاصة بك
      // مثال: MongoDB
      const Schedule = require('../routes/models/Schedule');
      await Schedule.create(scheduleData);
      
      console.log(`[${new Date().toISOString()}] 💾 تم حفظ ${scheduleData?.data?.length || 0} موعد`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ خطأ في الحفظ:`, error.message);
    }
  }

  /**
   * تشغيل Cron Job بين 1pm و3pm
   * يبدأ في 13:00 وينتهي في 15:00
   */
  startCronJob() {
    if (this.job) {
      console.log('Cron Job يعمل بالفعل');
      return;
    }

    // جدولة التشغيل كل دقيقة بين 13:00 و15:00
    this.job = cron.schedule('*/10 * 13-17 * * *', async () => {
      if (!this.isRunning) {
        this.isRunning = true;
        try {
          await this.fetchLandSchedule();
        } finally {
          this.isRunning = false;
        }
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Riyadh' // توقيت السعودية
    });

    console.log('🚀 تم تشغيل Cron Job (من 1pm إلى 3pm كل دقيقة)');
    
    // إضافة استماع لأحداث Cron
    this.job.on('error', (error) => {
      console.error('❌ خطأ في Cron Job:', error);
    });
  }

  /**
   * إيقاف Cron Job
   */
  stopCronJob() {
    if (this.job) {
      this.job.stop();
      console.log('⏹️  تم إيقاف Cron Job');
      this.job = null;
    }
  }

  /**
   * جلب جدول يدوي (للاختبار)
   */
  async manualFetch() {
    return await this.fetchLandSchedule();
  }

  /**
   * الحصول على حالة Cron Job
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isActive: !!this.job,
      nextRun: this.job ? 'Between 13:00-15:00' : 'Not scheduled'
    };
  }
}

module.exports = ScheduleCron;