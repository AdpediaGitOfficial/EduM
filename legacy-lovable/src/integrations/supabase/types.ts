export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          author_id: string
          body: string
          class_id: string | null
          created_at: string
          id: string
          title: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id: string
          body: string
          class_id?: string | null
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id?: string
          body?: string
          class_id?: string | null
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          category: string | null
          condition: string
          created_at: string
          id: string
          location: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          condition?: string
          created_at?: string
          id?: string
          location?: string | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          condition?: string
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          marked_by: string | null
          note: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date: string
          id?: string
          marked_by?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          created_at: string
          id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          broadcast_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          broadcast_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          attachment_url: string | null
          audience_ref: string | null
          audience_type: string
          body: string
          created_at: string
          id: string
          sender_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          audience_ref?: string | null
          audience_type: string
          body: string
          created_at?: string
          id?: string
          sender_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          audience_ref?: string | null
          audience_type?: string
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      bus_locations: {
        Row: {
          bus_id: string
          id: string
          lat: number
          lng: number
          recorded_at: string
          speed: number | null
        }
        Insert: {
          bus_id: string
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          speed?: number | null
        }
        Update: {
          bus_id?: string
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bus_locations_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
        ]
      }
      buses: {
        Row: {
          capacity: number
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          id: string
          number: string
          route_name: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          number: string
          route_name?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          number?: string
          route_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          academic_year: string
          created_at: string
          id: string
          name: string
          section: string | null
        }
        Insert: {
          academic_year?: string
          created_at?: string
          id?: string
          name: string
          section?: string | null
        }
        Update: {
          academic_year?: string
          created_at?: string
          id?: string
          name?: string
          section?: string | null
        }
        Relationships: []
      }
      complaint_messages: {
        Row: {
          body: string
          complaint_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          complaint_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          complaint_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_messages_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          body: string
          created_at: string
          escalated_to_admin: boolean
          id: string
          raised_by: string
          severity: string
          status: string
          student_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          escalated_to_admin?: boolean
          id?: string
          raised_by: string
          severity?: string
          status?: string
          student_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          escalated_to_admin?: boolean
          id?: string
          raised_by?: string
          severity?: string
          status?: string
          student_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_results: {
        Row: {
          created_at: string
          exam_id: string
          grade: string | null
          id: string
          marks_obtained: number
          remarks: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          grade?: string | null
          id?: string
          marks_obtained?: number
          remarks?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          grade?: string | null
          id?: string
          marks_obtained?: number
          remarks?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          class_id: string | null
          created_at: string
          exam_date: string | null
          id: string
          max_marks: number
          name: string
          subject_id: string | null
          term: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          max_marks?: number
          name: string
          subject_id?: string | null
          term?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          max_marks?: number
          name?: string
          subject_id?: string | null
          term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_assignments: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          due_date: string
          id: string
          status: Database["public"]["Enums"]["fee_status"]
          structure_id: string | null
          student_id: string
          title: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          created_at?: string
          due_date: string
          id?: string
          status?: Database["public"]["Enums"]["fee_status"]
          structure_id?: string | null
          student_id: string
          title: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          due_date?: string
          id?: string
          status?: Database["public"]["Enums"]["fee_status"]
          structure_id?: string | null
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_assignments_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          academic_year: string
          amount: number
          class_id: string | null
          created_at: string
          frequency: Database["public"]["Enums"]["fee_frequency"]
          id: string
          name: string
          term: string | null
        }
        Insert: {
          academic_year?: string
          amount: number
          class_id?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["fee_frequency"]
          id?: string
          name: string
          term?: string | null
        }
        Update: {
          academic_year?: string
          amount?: number
          class_id?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["fee_frequency"]
          id?: string
          name?: string
          term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          name: string
          start_date: string
          type: Database["public"]["Enums"]["holiday_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          name: string
          start_date: string
          type?: Database["public"]["Enums"]["holiday_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          type?: Database["public"]["Enums"]["holiday_type"]
        }
        Relationships: []
      }
      homework: {
        Row: {
          assigned_date: string
          attachment_type: string | null
          attachment_url: string | null
          class_id: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          max_marks: number | null
          priority: string
          status: string
          subject_id: string | null
          teacher_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_date?: string
          attachment_type?: string | null
          attachment_url?: string | null
          class_id: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          max_marks?: number | null
          priority?: string
          status?: string
          subject_id?: string | null
          teacher_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_date?: string
          attachment_type?: string | null
          attachment_url?: string | null
          class_id?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          max_marks?: number | null
          priority?: string
          status?: string
          subject_id?: string | null
          teacher_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          attachment_url: string | null
          created_at: string
          homework_id: string
          id: string
          marks: number | null
          note: string | null
          remarks: string | null
          reviewed_at: string | null
          status: string
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          homework_id: string
          id?: string
          marks?: number | null
          note?: string | null
          remarks?: string | null
          reviewed_at?: string | null
          status?: string
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          homework_id?: string
          id?: string
          marks?: number | null
          note?: string | null
          remarks?: string | null
          reviewed_at?: string | null
          status?: string
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      library_books: {
        Row: {
          author: string | null
          available_copies: number
          category: string | null
          created_at: string
          id: string
          isbn: string | null
          title: string
          total_copies: number
          updated_at: string
        }
        Insert: {
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          title: string
          total_copies?: number
          updated_at?: string
        }
        Update: {
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          title?: string
          total_copies?: number
          updated_at?: string
        }
        Relationships: []
      }
      library_loans: {
        Row: {
          book_id: string
          created_at: string
          due_at: string
          id: string
          issued_at: string
          returned_at: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          due_at: string
          id?: string
          issued_at?: string
          returned_at?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          due_at?: string
          id?: string
          issued_at?: string
          returned_at?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_loans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student: {
        Row: {
          id: string
          parent_id: string
          relationship: string | null
          student_id: string
        }
        Insert: {
          id?: string
          parent_id: string
          relationship?: string | null
          student_id: string
        }
        Update: {
          id?: string
          parent_id?: string
          relationship?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          fee_assignment_id: string
          id: string
          method: string
          notes: string | null
          paid_at: string
          receipt_no: string
          recorded_by: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
        }
        Insert: {
          amount: number
          fee_assignment_id: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          receipt_no?: string
          recorded_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
        }
        Update: {
          amount?: number
          fee_assignment_id?: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          receipt_no?: string
          recorded_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_fee_assignment_id_fkey"
            columns: ["fee_assignment_id"]
            isOneToOne: false
            referencedRelation: "fee_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_audit_log: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          new_value: boolean
          old_value: boolean | null
          permission_key: string
          target_user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          new_value: boolean
          old_value?: boolean | null
          permission_key: string
          target_user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          new_value?: boolean
          old_value?: boolean | null
          permission_key?: string
          target_user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      progress_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          note_date: string
          student_id: string
          teacher_id: string
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          note_date?: string
          student_id: string
          teacher_id: string
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          note_date?: string
          student_id?: string
          teacher_id?: string
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          permission_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          admission_date: string
          admission_no: string | null
          class_id: string | null
          created_at: string
          gender: string | null
          id: string
          profile_id: string
          roll_no: string | null
        }
        Insert: {
          admission_date?: string
          admission_no?: string | null
          class_id?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          profile_id: string
          roll_no?: string | null
        }
        Update: {
          admission_date?: string
          admission_no?: string | null
          class_id?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          profile_id?: string
          roll_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          class_id: string | null
          code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          class_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          class_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_classes: {
        Row: {
          class_id: string
          created_at: string
          id: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          email: string
          experience_years: number
          full_name: string
          id: string
          joined_date: string
          phone: string | null
          qualification: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          experience_years?: number
          full_name: string
          id?: string
          joined_date?: string
          phone?: string | null
          qualification?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          experience_years?: number
          full_name?: string
          id?: string
          joined_date?: string
          phone?: string | null
          qualification?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      timetable: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          room: string | null
          start_time: string
          subject_id: string | null
          teacher_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          room?: string | null
          start_time: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room?: string | null
          start_time?: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      announcement_audience:
        | "all"
        | "admins"
        | "teachers"
        | "students"
        | "parents"
        | "class"
      app_role: "admin" | "teacher" | "student" | "parent"
      attendance_status: "present" | "absent" | "late" | "excused"
      fee_frequency: "one_time" | "monthly" | "quarterly"
      fee_status: "pending" | "paid" | "overdue" | "partial"
      holiday_type: "holiday" | "vacation" | "exam" | "event"
      payment_status: "pending" | "successful" | "failed" | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_audience: [
        "all",
        "admins",
        "teachers",
        "students",
        "parents",
        "class",
      ],
      app_role: ["admin", "teacher", "student", "parent"],
      attendance_status: ["present", "absent", "late", "excused"],
      fee_frequency: ["one_time", "monthly", "quarterly"],
      fee_status: ["pending", "paid", "overdue", "partial"],
      holiday_type: ["holiday", "vacation", "exam", "event"],
      payment_status: ["pending", "successful", "failed", "refunded"],
    },
  },
} as const
