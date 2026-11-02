const shipReportData = [
    {
        noon_report:{
            total_distance: 0,
            balance_distance: 0,
        },
        arrival_report:{
            aweigh_of_last_point: 0,
            time_of_EOSP: 0,
            ROB_FO_of_EOSP: 0,
            ROB_FO_of_COSP_last_port: 0,
            ROB_DD_of_EOSP: 0,
            ROB_DO_of_COSP_last_port: 0,
            ROB_FO_of_RSE: 0,
            ROB_DO_of_RSE: 0,
            time_of_RSE: 0,
            total_time_of_waiting: 0,
            total_time_of_sea_passage: 0,
            total_distance_of_sea_passage: 0,
            total_consumption_of_FO: 0,
            total_consumption_of_DO: 0,
            total_consumption_of_FO_when_waiting: 0,
            total_consumption_of_DO_when_waiting: 0,
            total_time_using_when_waiting: 0,
            total_time_of_sea_passage: 0,
            voyage_average_FO_consumption: 0,
            voyage_average_DO_consumption: 0,
        },
        berthing_report:{
            aweigh_of_last_point: 0,
            time_of_EOSP: 0,
            ROB_FO_of_EOSP: 0,
            ROB_FO_of_COSP_last_port: 0,
            ROB_DD_of_EOSP: 0,
            ROB_DO_of_COSP_last_port: 0,
            ROB_FO_of_RSE: 0,
            ROB_DO_of_RSE: 0,
            time_of_RSE: 0,
            total_time_of_waiting: 0,
            total_time_of_sea_passage: 0,
            total_distance_of_sea_passage: 0,
            total_consumption_of_FO: 0,
            total_consumption_of_DO: 0,
            total_consumption_of_FO_when_waiting: 0,
            total_consumption_of_DO_when_waiting: 0,
            total_time_using_when_waiting: 0,
            total_time_of_sea_passage: 0,
            voyage_average_FO_consumption: 0,
            voyage_average_DO_consumption: 0,
        },
        daily_report:{},
        departure_report:{
            estimate_distance: 0,
            cargo_of_working_commenced_loading_or_discharging: 0,
            cargo_of_working_completed_loading_or_discharging: 0,
            ROB_FO_of_commenced_working: 0,
            ROB_FO_of_completed_working: 0,
            ROB_DO_of_commenced_working: 0,
            ROB_DO_of_completed_working: 0,
            cargo_of_working_commenced_loading_or_discharging: 0,
            cargo_of_working_completed_loading_or_discharging: 0,
            total_working_hour: 0,
            total_consumption_of_FO_when_working: 0,
            total_consumption_of_DO_when_working: 0,
            total_time_using_at_port: 0,
        },
        shifting_report:{},
        irregular_report:{},
    },
    {
        noon_report: {
            total_distance: 120.5,         // 公里
            balance_distance: 30.2,        // 公里
        },
        arrival_report: {
            aweigh_of_last_point: 6.3,                 // 略小的速度
            time_of_EOSP: 1761228600,                  // 原 1761232200 提前 1 小時 → 2025-11-19T13:30:00Z
            ROB_FO_of_EOSP: 255.0,                     // 略高於原本，因為時間早
            ROB_FO_of_COSP_last_port: 305.0,           // 略高
            ROB_DD_of_EOSP: 102.0,                     // 略高
            ROB_DO_of_COSP_last_port: 122.0,           // 略高
            ROB_FO_of_RSE: 245.0,                       // 略高
            ROB_DO_of_RSE: 96.0,                        // 略高
            time_of_RSE: 1761222000,                    // 原 1761225600 提前 1 小時 → 2025-11-19T11:00:00Z
            total_time_of_waiting: 2.3,                 // 略短
            total_time_of_sea_passage: 17.5,            // 略短
            total_distance_of_sea_passage: 118.0,       // 略短距離
            total_consumption_of_FO: 53.0,             // 略少
            total_consumption_of_DO: 14.5,             // 略少
            total_consumption_of_FO_when_waiting: 1.8, // 略少
            total_consumption_of_DO_when_waiting: 0.45,// 略少
            total_time_using_when_waiting: 2.3,        // 略短
            voyage_average_FO_consumption: 2.9,        // 略低
            voyage_average_DO_consumption: 0.75        // 略低
        },
        berthing_report: {
            aweigh_of_last_point: 6.5,     // 公里/小時 或其他單位速度
            time_of_EOSP: 1761232200, // ISO 時間
            ROB_FO_of_EOSP: 250.0,         // 重油 Remaining on Board (噸)
            ROB_FO_of_COSP_last_port: 300.0,
            ROB_DD_of_EOSP: 100.0,         // 柴油 Remaining on Board (噸)
            ROB_DO_of_COSP_last_port: 120.0,
            ROB_FO_of_RSE: 240.0,
            ROB_DO_of_RSE: 95.0,
            time_of_RSE: 1761225600,
            total_time_of_waiting: 2.5,    // 小時
            total_time_of_sea_passage: 18.0,
            total_distance_of_sea_passage: 120.5, // 公里
            total_consumption_of_FO: 55.0,       // 噸
            total_consumption_of_DO: 15.0,
            total_consumption_of_FO_when_waiting: 2.0,
            total_consumption_of_DO_when_waiting: 0.5,
            total_time_using_when_waiting: 2.5, // 小時
            voyage_average_FO_consumption: 3.0, // 噸/小時
            voyage_average_DO_consumption: 0.8, // 噸/小時
        },
        daily_report: {
        // 假設可以加入欄位，否則保留空
        },
        departure_report: {
            time_of_COSP: 1761218400, // ISO 時間
            estimate_distance: 130.0,      // 公里
            cargo_of_working_commenced_loading_or_discharging: 500.0, // 噸
            cargo_of_working_completed_loading_or_discharging: 480.0, // 噸
            ROB_FO_of_commenced_working: 240.0,  // 噸
            ROB_FO_of_completed_working: 220.0,  // 噸
            ROB_DO_of_commenced_working: 95.0,   // 噸
            ROB_DO_of_completed_working: 90.0,   // 噸
            total_working_hour: 8.0,              // 小時
            total_consumption_of_FO_when_working: 20.0, // 噸
            total_consumption_of_DO_when_working: 5.0,  // 噸
            total_time_using_at_port: 8.0,        // 小時
        },
        shifting_report:{},
        irregular_report:{},
    },
    {
        noon_report: {
            total_distance: 120.5,         // 公里
            balance_distance: 30.2,        // 公里
        },
        arrival_report: {
            aweigh_of_last_point: 6.3,                 
            time_of_EOSP: 1761228600,                  // 2025-11-19T13:30:00Z
            ROB_FO_of_EOSP: 255.0,                     
            ROB_FO_of_COSP_last_port: 305.0,           
            ROB_DD_of_EOSP: 102.0,                     
            ROB_DO_of_COSP_last_port: 122.0,           
            ROB_FO_of_RSE: 245.0,                      
            ROB_DO_of_RSE: 96.0,                       
            time_of_RSE: 1761222000,                    // 2025-11-19T11:00:00Z
            total_time_of_waiting: 2.3,                
            total_time_of_sea_passage: 17.5,           
            total_distance_of_sea_passage: 118.0,      
            total_consumption_of_FO: 53.0,             
            total_consumption_of_DO: 14.5,             
            total_consumption_of_FO_when_waiting: 1.8, 
            total_consumption_of_DO_when_waiting: 0.45,
            total_time_using_when_waiting: 2.3,        
            voyage_average_FO_consumption: 2.9,        
            voyage_average_DO_consumption: 0.75        
        },
        berthing_report: {
            aweigh_of_last_point: 6.3,                 
            time_of_EOSP: 1761228600,                  // 2025-11-19T13:30:00Z
            ROB_FO_of_EOSP: 255.0,                     
            ROB_FO_of_COSP_last_port: 305.0,           
            ROB_DD_of_EOSP: 102.0,                     
            ROB_DO_of_COSP_last_port: 122.0,           
            ROB_FO_of_RSE: 245.0,                      
            ROB_DO_of_RSE: 96.0,                       
            time_of_RSE: 1761222000,                    // 2025-11-19T11:00:00Z
            total_time_of_waiting: 2.3,                
            total_time_of_sea_passage: 17.5,           
            total_distance_of_sea_passage: 118.0,      
            total_consumption_of_FO: 53.0,             
            total_consumption_of_DO: 14.5,             
            total_consumption_of_FO_when_waiting: 1.8, 
            total_consumption_of_DO_when_waiting: 0.45,
            total_time_using_when_waiting: 2.3,        
            voyage_average_FO_consumption: 2.9,        
            voyage_average_DO_consumption: 0.75        
        },
        daily_report: {
        // 假設可以加入欄位，否則保留空
        },
        departure_report: {
            time_of_COSP: 1761218400, 
            estimate_distance: 130.0, 
            cargo_of_working_commenced_loading_or_discharging: 500.0,
            cargo_of_working_completed_loading_or_discharging: 480.0,
            ROB_FO_of_commenced_working: 240.0,  
            ROB_FO_of_completed_working: 220.0,  
            ROB_DO_of_commenced_working: 95.0,   
            ROB_DO_of_completed_working: 90.0,   
            total_working_hour: 8.0,             
            total_consumption_of_FO_when_working: 20.0, 
            total_consumption_of_DO_when_working: 5.0,  
            total_time_using_at_port: 8.0,       
        },
        shifting_report:{},
        irregular_report:{},
    },
];